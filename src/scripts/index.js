

const GLOBAL_sep = /\s+|;|・|\(|（|\)|）|～|‐|-|―|－|&|＆|#|＃|映画\s*|劇場版\s*|!|！|\?|？|…|『|』|「|」/g;
let dsaDialog;

// webhook default settings
const webhookDefaultSetting = {
    postUrl: "", webhookNoMatched: true,
    webhookNoWorkId: false, webhookSuccess: false, webhookContentChanged: false, webhookContent: {}
};
const webhookDefaultString = JSON.stringify({ [Date.now()]: webhookDefaultSetting });

// check access token
const inputObj = { token: "", sendingTime: 300, annictSend: true, withTwitter: false, withFacebook: false, webhookSettings: webhookDefaultString };

let GLOBAL_storage = {};
let GLOBAL_access_token = "";

function showMessage(message, dialog = dsaDialog) {
    dialog.text(message);
    dialog.hide().fadeIn('slow', () =>
        setTimeout(() => {
            dialog.fadeOut('slow')
        }, 5000)
    )
}

$(function () {
    $("<style>", { type: 'text/css' })
        .append(".dsa-dialog { position: fixed;  bottom: 60px;  right: 10px; border: 1px solid #888888;  padding: 2pt;  background-color: #ffffff;  filter: alpha(opacity=85);  -moz-opacity: 0.85;  -khtml-opacity: 0.85;  opacity: 0.85;      text-shadow: 0 -1px 1px #FFF, -1px 0 1px #FFF, 1px 0 1px #aaa;  -webkit-box-shadow: 1px 1px 2px #eeeeee;  -moz-box-shadow: 1px 1px 2px #eeeeee;  -webkit-border-radius: 3px;  -moz-border-radius: 3px; display: none;}")
        .appendTo("head");
    $("<div>").addClass("dsa-dialog").text('Message').appendTo("body");
    dsaDialog = $(".dsa-dialog");

    chrome.storage.sync.get(inputObj, items => {
        GLOBAL_storage = items;
        GLOBAL_access_token = GLOBAL_storage.token;
        if (GLOBAL_access_token == "") showMessage("There is no access token of `Annict`.");
        if (GLOBAL_storage.sendingTime - 0 < 0) GLOBAL_storage.sendingTime = 300;
        if (Object.keys(GLOBAL_storage).indexOf("annictSend") == -1) GLOBAL_storage.annictSend = true;
    })
})


window.onload = async function () {

    // メッセージ用のボックスをInjectする
    let GLOBAL_RecordSend = true;
    const video = $("#video").get(0);
    let workInfo = {};
    video.addEventListener("loadstart", async function () {
        const WatchingEpisode = {
            workTitle: $(".backInfoTxt1").text(),
            episodeTitle: $(".backInfoTxt3").text(),
            episodeNumber: $(".backInfoTxt2").text(),
            number: title2number(remakeString($(".backInfoTxt2").text(), "episodeNumber"))
        };
        //console.log(WatchingEpisode);
        await obtainWork(WatchingEpisode).then(async workInfo => {
            console.log(workInfo);
            GLOBAL_RecordSend = (workInfo != {});
            if (!GLOBAL_RecordSend && workInfo.nodes == []) {
                const error_message = `No Hit Title: ${workInfo.danime.workTitle}`;
                if (GLOBAL_access_token) showMessage(error_message);
                await post2webhook(workInfo.webhook);
            } 
            setTimeout(async () => { // in 5 min until video started
                if (GLOBAL_RecordSend && workInfo.nodes !=[]){
                    await sendRecord(workInfo, WatchingEpisode);
                }
                chrome.storage.sync.set({ lastWatched: JSON.stringify(WatchingEpisode), lastVideoOver: false });
            });
        }, GLOBAL_storage.sendingTime * 1000)
    });
    video.addEventListener("ended", async () => { // video ended
        const WatchingEpisode = {
            workTitle: $(".backInfoTxt1").text(),
            episodeTitle: $(".backInfoTxt3").text(),
            episodeNumber: $(".backInfoTxt2").text(),
            number: title2number(remakeString($(".backInfoTxt2").text(), "episodeNumber"))
        };
        if (GLOBAL_RecordSend && workInfo.nodes != []) {
            await sendRecord(workInfo, WatchingEpisode);
        }
        chrome.storage.sync.set({ lastWatched: JSON.stringify(WatchingEpisode), lastVideoOver: true });
        // 最後まで見た場合, lastVideoOver=trueで把握
    });
    /*const nextButton = $(".nextButton").get(0)
    nextButton.addEventListener("click", () => { // video skipped
        sendAnnict();
    });*/

    async function sendRecord(workInfo, WatchingEpisode) {
        chrome.storage.sync.get({ lastWatched: JSON.stringify({}), lastVideoOver: false }, async item => {
            const lastWatched = JSON.parse(item.lastWatched);
            const IsSuspended = (WatchingEpisode == lastWatched) && !item.lastVideoOver;
            const IsSameMovie = (workInfo.nodes.some(d => d.media == "MOVIE")) && (lastWatched.workTitle == WatchingEpisode.workTitle);
            const IsSplitedEpisode = Object.entries({ workTitle: true, episodeTitle: true, episodeNumber: false, number: true })
                .every(kv => kv[1] == (lastWatched[kv[0]] == WatchingEpisode[kv[0]]));
            //console.log({ GLOBAL_RecordSend, IsSuspended, IsSameMovie, IsSplitedEpisode })
            if (GLOBAL_RecordSend && (!IsSuspended || !IsSameMovie || !IsSplitedEpisode)) {
                await post2webhook(workInfo.webhook);
                await sendAnnict(workInfo);
            }
        })
    }

    async function sendAnnict(workInfo) {
        if (GLOBAL_storage.annictSend) {
            console.log("sending to Annict");
            const danime = workInfo.danime;
            let statuses = [];
            for (const node of workInfo.nodes) {
                statuses.push(await post2annict(node));
            }
            const result_message = `${danime.workTitle} ${danime.episodeNumber} Annict sending ${statuses.every(d => d) ? 'successed' : 'failed'}.`;
            console.log(result_message);
            showMessage(result_message);
        }
    }

    async function obtainWork(WatchingEpisode) {
        const IsCombinedEpisode = (/～|／/.test(WatchingEpisode.episodeNumber) &&
            WatchingEpisode.episodeNumber.split(/～|／/g).every(d => title2number(remakeString(d, "episodeNumber"))) != null);
        if (!IsCombinedEpisode) {
            return await identifyWork(WatchingEpisode);
        }
        else {
            const splited_episodeNumbers = WatchingEpisode.episodeNumber.split(/～|／/g)
                .map(d => title2number(remakeString(d, "episodeNumber")));
            const episodeRange = [splited_episodeNumbers[0], splited_episodeNumbers.slice(-1)[0]];
            //console.log(splited_episodeNumbers, episodeRange)
            const episodeNumbers = [...Array(episodeRange[1] - episodeRange[0] + 1).keys()].map(num => num + episodeRange[0]);
            let workInfos = [];
            for (const episodeNumber of episodeNumbers) {
                const episodeNow = {
                    workTitle: WatchingEpisode.workTitle,
                    episodeTitle: "",
                    episodeNumber: `${episodeNumber}`,
                    number: episodeNumber
                }
                const workInfoTmp = await identifyWork(episodeNow);
                if (workInfoTmp != {}) workInfos.push(workInfoTmp);
            }
            const errorMessage = Array.from(new Set(workInfos.map(d => d.webhook.error))).sort().join(" ");
            return { webhook: { danime: WatchingEpisode, error: errorMessage }, nodes: [].concat(...workInfos.map(d => d.nodes)) };
        }
    }
    async function identifyWork(WatchingEpisode) {
        if (!GLOBAL_RecordSend) return {};

        //const GLOBAL_site=["https://anime.dmkt-sp.jp/animestore/sc_d_pc?partId*", # for Amazon Prime
        //"https://www.amazon.co.jp/Amazon-Video/b?ie=UTF8&node="].filter(d=>location.href.indexOf(d)!=-1)

        const danime = {
            workTitle: WatchingEpisode.workTitle,
            episodeNumber: remakeString(WatchingEpisode.episodeNumber, "episodeNumber"),
            episodeTitle: remakeString(WatchingEpisode.episodeTitle, "title"),
            number: WatchingEpisode.number,
            splitedTitle: WatchingEpisode.workTitle.split(GLOBAL_sep).filter(d => !/^\s*$/.test(d)),
            workId: location.href.match(/(?<=partId=)\d{5}/)[0]
        };
        // Annict TokenがなくてもWebhookは実行できるように変更
        if (!GLOBAL_access_token) return { danime: danime, nodes: [], webhook: { danime: danime, error: "noAnnictToken" } };
        const result_nodes = await fetchWork(danime.splitedTitle[0])
            .then(d => d.map(dd => dd.node));
        //console.log(result_nodes)
        if (result_nodes.length == 0) {
            return { danime: danime, nodes: [], webhook: { danime: danime, error: "noWorkMatched" } }
        }
        let goodWorkNodes = await checkTitleWithWorkId(danime.workId, result_nodes);
        const workIdIsFound = (goodWorkNodes.length != 0);
        if (!workIdIsFound) goodWorkNodes = result_nodes;
        console.log("Work Candidates:\n", goodWorkNodes);

        const combinedEpisodeNode = [].concat(...goodWorkNodes.map(workNode => {
            if (workNode.episodes.edges.length > 0) {
                const episodeNodes=workNode.episodes.edges.map(d => d.node);
                const unitNum=Math.min(...episodeNodes.map(d=>d.sortNumber).filter(d=>d>0));
                return episodeNodes.map(d=>{
                    d.sortNumber=d.sortNumber / unitNum;
                    return d;
                })
            }
            else return { title: workNode.title, number: "", annictId: workNode.annictId, media: workNode.media, IsZeroEpisode: true }; // only 0 episode
        }));
        const episodes_numberAndCheck = combinedEpisodeNode.map(episode_node =>
            [workIdIsFound,
                checkTitle([danime.episodeTitle, episode_node.title], "every"),
                (episode_node.number || episode_node.sortNumber) == danime.number]);
        const episodes_judges = episodes_numberAndCheck.map(d =>
            [d[0] && d[1] && d[2], // workId is found and episode title & number corresponds
            d[0] && d[1], // workId is found and episode title corresponds
            d[0] && d[2], // workId is found and episode number corresponds
            d[1] && d[2], // episode title and number corresponds
            d[1], // episode title corresponds
            d[2]]); // episode number corresponds
        const judge_kinds = episodes_judges[0].length;
        const valid_check_methods = [...Array(judge_kinds).keys()].filter(num => episodes_judges.filter(d => d[num]).length > 0);
        //console.log(danime, combinedEpisodeNode, episodes_numberAndCheck)
        const error_messages = [[valid_check_methods.length == 0, "noEpisodeMatched"], [!workIdIsFound, "noWorkId"]]
            .filter(d => d[0]).map(d => d[1]).join(" ");
        if (valid_check_methods.length > 0) {
            const episode_node = episodes_judges.map((d, ind) => [d[valid_check_methods[0]], combinedEpisodeNode[ind]])
                .filter(d => d[0]).map(d => d[1])[0];
            const webhookContent = (error_messages.length > 0) ?  // error or workId未登録の場合に指定したURLにwebhookを送信
                { danime: danime, error: error_messages } :
                { danime: danime, error: "" };
            return { danime: danime, nodes: [episode_node], webhook: webhookContent };
        } else {
            return {
                danime: danime, nodes: [],
                webhook: { danime: danime, error: error_messages }
            };
        }
    }
}

//------------------ functions -------------------

function remakeString(input_str, mode = "title") {
    const delete_array = ["「", "」", "『", "』", "｢", "｣"];
    const remake_dic = {
        "〈": "＜", "〉": "＞",
        "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V", "Ⅵ": "VI", "Ⅶ": "VII", "Ⅷ": "VIII", "Ⅸ": "IX", "Ⅹ": "X"
    };
    if (mode == "episodeNumber") {
        return kanji2arab(input_str).replace(/[０-９]/g, s => // 全角=>半角
            String.fromCharCode(s.charCodeAt(0) - 65248));
    } else if (mode == "title") {
        return input_str.replace(/[Ａ-Ｚａ-ｚ０-９：]/g, s => // 全角=>半角
            String.fromCharCode(s.charCodeAt(0) - 65248))
            .replace(new RegExp(delete_array.join("|"), "g"), "")
            .replace(new RegExp(Object.keys(remake_dic).join("|"), "g"), match => remake_dic[match]);
    }
}
function title2number(str) {
    if (!str) return "";
    const str2 = str.match(/\d+/);
    return parseInt(str2, 10);
}

function checkTitle(titles, mode = "length") {
    if (titles.some(d => !d)) return false;
    const titles_splited = titles.map(d => remakeString(d, "title").split(GLOBAL_sep).filter(d => !/^\s*$/.test(d)));
    if (mode == "length") return titles_splited[0].filter(d => titles_splited[1].join("").indexOf(d) != -1).length;
    else if (mode == "every") return titles_splited[0].every(d => titles_splited[1].join("").indexOf(d) != -1);
}


async function checkTitleWithWorkId(danime_workId, work_nodes) {
    //現状、vod情報はREST APIやgraphQLから取得できない。(存在はしている)
    let good_nodes = [];
    for (const work_node of work_nodes) {
        const annictId = work_node.annictId

        const db_url = `https://api.annict.com/db/works/${annictId}/programs`;
        const db_html = await fetch(db_url).then(d => d.body)
            .then(d => d.getReader()).then(reader => reader.read())
            .then(db_reader => new TextDecoder("utf-8").decode(db_reader.value));

        const danime_info = $("tr", db_html).toArray()
            .map(el => [$("td:eq(1)", el).text(), $("td:eq(5)", el).text()])
            .filter(d => d[0].indexOf("241") != -1)
            .map(d => d[1].match(/\d+/));
        if (danime_info.length > 0) continue;
        if (danime_info.indexOf(danime_workId) != -1) good_nodes.push(work_node);
    }
    return good_nodes;
}

async function post2annict(node) {
    // AnnictへのPOST
    if (Object.keys(node).indexOf("IsZeroEpisode") != -1 && node.IsZeroEpisode) {
        //作品に対する投稿は、status変更で対応
        const parameters = { "work_id": node.annictId, kind: "watched", access_token: GLOBAL_access_token }
        const url = `https://api.annict.com/v1/me/statuses?${Object.entries(parameters).map(d => d.join("=")).join("&")}`;
        return await fetch(url, { method: "POST" }).then(res => res.status);
    }
    else {
        const parameters = {
            episode_id: node.annictId, access_token: GLOBAL_access_token,
            share_twitter: GLOBAL_storage.withTwitter, share_facebook: GLOBAL_storage.withFacebook
        };
        const url = `https://api.annict.com/v1/me/records?${Object.entries(parameters).map(d => d.join("=")).join("&")}`;
        return await fetch(url, { method: "POST" }).then(res => res.status);
    }
}

async function post2webhook(args_dict) {
    console.log("posting webhook");
    const danime = args_dict.danime;
    const origPostData = {
        workTitle: danime.workTitle, episodeNumber: danime.episodeNumber,
        episodeTitle: danime.episodeTitle,
        danimeWorkId: danime.workId, error: args_dict.error
    };
    const webhookMatchingObj = {
        "noWorkMatched": "webhookNoMatched", "noEpisodeMatched": "webhookNoMatched",
        "noWorkId": "webhookNoWorkId", "none": "webhookSuccess"
    }
    const headers = {
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    let webhookSettings = checkWebhookSettings(GLOBAL_storage.webhookSettings);

    for (const webhookSetting of Object.values(webhookSettings)) {
        let postData = {};
        if (webhookSetting.webhookContentChanged) {
            const postJson = webhookSetting.webhookContent;
            postData = Object.entries(postJson).reduce((obj, kv) => {
                const val = kv[1].replace(/\{[^\{]+\}/g, s_in => {
                    s = s_in.slice(1, -1);
                    if (Object.keys(origPostData).indexOf(s) != -1) return origPostData[s];
                    else return s;
                });
                return Object.assign(obj, { [kv[0]]: val });
            }, {});
        } else postData = origPostData;
        //console.log(webhookSetting);
        if (!Object.entries(webhookMatchingObj).some(kv => origPostData.error.indexOf(kv[0]) != -1 && webhookSetting[kv[1]])) continue;
        let options = { method: "POST", headers: headers, body: JSON.stringify(postData) };
        if (webhookSetting.postUrl.indexOf("://script.google.com/macros/") != -1) options.mode = "no-cors";
        const res = await fetch(webhookSetting.postUrl, options);
        //console.log(res);
    }
}


async function fetchWork(title) {
    const query = `
    { searchWorks(
            titles:"${title}",
            orderBy: { field: WATCHERS_COUNT, direction: DESC },
        ) {
            edges {
                node {
                    title
                    annictId
                    media
                    malAnimeId
                    episodes(
                        orderBy: { field: SORT_NUMBER, direction: ASC },
                    ) {
                        edges {
                            node {
                            annictId
                            sortNumber
                            number
                            title
                            }
                        }
                    }
                }
            }
        }
    }`.replace(/\n/g, "").replace(/\s+/g, " ");
    const graphql_url = `https://api.annict.com/graphql?query=${query}`;
    //console.log(graphql_url)
    const headers = {
        'Authorization': `Bearer ${GLOBAL_access_token}`
    };
    const opts = {
        method: "POST",
        headers: headers
    };
    return await fetch(graphql_url, opts)
        .then(res => res.json())
        .then(jsoned => jsoned.errors ? [] : jsoned.data.searchWorks.edges);
}

function checkWebhookSettings(webhookSettingsTmp) {
    let webhookSettings = {};
    try { webhookSettings = JSON.parse(webhookSettingsTmp); }
    catch (e) {
        try {
            webhookSettings = Object.assign(...[...Array(webhookSettingsTmp.length).keys()]
                .map(key => Object({ [key]: webhookSettingsTmp[key] })));
        } catch (e) { webhookSettings = JSON.parse(webhookDefaultString); }
    }
    return webhookSettings;
}

//----------------Kanji2Arab: modified from http://aok.blue.coocan.jp/jscript/kan2arb.html---------------


/********************************************************
 *
 *  漢数字をアラビア数字にする
 *
 *  Copyright (c) 2005 AOK. All Rights Reserved.
 *
 ********************************************************/
const const_kanji = {
    num: { char: "〇一二三四五六七八九零壱弐参肆伍陸質捌玖零壹貳參", limit: 10 },
    mag1: { char: "十百千拾佰仟十陌阡", limit: 3 },
    mag2: { char: "万億兆萬", limit: 3 }
};

function kanji2arab(src) {
    const reg = new RegExp(`[${const_kanji.num.char}${const_kanji.mag1.char}]\
        [${const_kanji.num.char}${const_kanji.mag1.char}${const_kanji.mag2.char}]*`, "g");
    return src.replace(reg, $0 => toArb($0));
};

function toArb(input_kanji) {
    let IsAfterMag = false;
    let output_num = 0;
    let output_includeMag = 0;
    for (const input_char of input_kanji) {
        if ((numIn = const_kanji.num.char.indexOf(input_char)) != -1) { //0-9
            if (IsAfterMag) {
                output_num += numIn % 10;
                IsAfterMag = false;
            } else {
                output_num = output_num * 10 + numIn % 10;
            }
        } else if ((numMag1 = const_kanji.mag1.char.indexOf(input_char)) != -1) { // 10^[1-3]
            output_includeMag += output_num;
            output_num = 0;
            const mag_tmp = output_includeMag % 10;
            const num_tmp = (mag_tmp == 0 ? 1 : mag_tmp) * 10 ** (numMag1 % const_kanji.mag1.limit + 1);
            output_includeMag += num_tmp - mag_tmp;
            IsAfterMag = true;
        } else if ((numMag2 = const_kanji.mag2.char.indexOf(input_char)) != -1) { // 10^4n
            output_includeMag += output_num;
            output_num = 0;
            const mag_tmp = output_includeMag % 10000;
            const num_tmp = mag_tmp * 10000 ** (numMag2 % const_kanji.mag2.limit + 1);
            output_includeMag += num_tmp - mag_tmp;
            IsAfterMag = true;
        } else return input_kanji; // can't convert
    }
    return output_includeMag + output_num; // return output
};


