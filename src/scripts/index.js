

const GLOBAL_sep = /\s|;|・|\(|（|～|‐|-|―|－|&|＆|#|＃/g;
let dsaDialog;

// check access token
const inputObj = { token: "", sendingTime: 300, webhookSettings: [] };

let GLOBAL_storage = {};
let GLOBAL_access_token = "";

$(function(){
    chrome.storage.sync.get(inputObj, items => {
        GLOBAL_storage = items;
        GLOBAL_access_token = GLOBAL_storage.token;
        if (GLOBAL_access_token == "") showMessage("There is no access token of `Annict`.");
        if (GLOBAL_storage.sendingTime - 0 < 0) GLOBAL_storage.sendingTime = 300;
    })
})


window.onload = async function () {

    // メッセージ用のボックスをInjectする
    $("<style>", { type: 'text/css' })
        .append(".dsa-dialog { position: fixed;  bottom: 60px;  right: 10px; border: 1px solid #888888;  padding: 2pt;  background-color: #ffffff;  filter: alpha(opacity=85);  -moz-opacity: 0.85;  -khtml-opacity: 0.85;  opacity: 0.85;      text-shadow: 0 -1px 1px #FFF, -1px 0 1px #FFF, 1px 0 1px #aaa;  -webkit-box-shadow: 1px 1px 2px #eeeeee;  -moz-box-shadow: 1px 1px 2px #eeeeee;  -webkit-border-radius: 3px;  -moz-border-radius: 3px; display: none;}")
        .appendTo("head");
    $("<div>").addClass("dsa-dialog").text('Message').appendTo("body");
    dsaDialog = $(".dsa-dialog");

    let GLOBAL_notSent = true;
    const video = $("#video").get(0);
    video.addEventListener("loadstart", () => {
        GLOBAL_notSent = true;
        setTimeout(async () => { // in 5 min until video started
            const WatchingEpisode = JSON.stringify({
                Title: $(".backInfoTxt1").text(),
                EpisodeTitle: $(".backInfoTxt3")
            });
            await chrome.storage.sync.get({ lastWatched: JSON.stringify({}) }, async item => {
                if (item.lastWatched != WatchingEpisode) await sendAnnict(); // 視聴中断->再開した場合は重複送信しないように
            });
            chrome.storage.sync.set({ lastWatched: WatchingEpisode });
        }, GLOBAL_storage.sendingTime * 1000)
    });
    video.addEventListener("ended", async () => { // video ended
        const WatchingEpisode = JSON.stringify({
            Title: $(".backInfoTxt1").text(),
            EpisodeTitle: $(".backInfoTxt3")
        });
        await chrome.storage.sync.get({ lastWatched: JSON.stringify({}) }, async item => {
            if (item.lastWatched != WatchingEpisode) await sendAnnict(); // 視聴中断->再開した場合は重複送信しないように
        });
        chrome.storage.sync.set({ lastWatched: JSON.stringify({}) }); // 最後まで見たなら、同じエピソードでも連続記録OK
    });
    /*const nextButton = $(".nextButton").get(0)
    nextButton.addEventListener("click", () => { // video skipped
        sendAnnict();
    });*/

    async function sendAnnict() {
        console.log("Start Sending")
        if (!GLOBAL_access_token || !GLOBAL_notSent) return;

        //const GLOBAL_site=["https://anime.dmkt-sp.jp/animestore/sc_d_pc?partId*", # for Amazon Prime
        //"https://www.amazon.co.jp/Amazon-Video/b?ie=UTF8&node="].filter(d=>location.href.indexOf(d)!=-1)

        const tmp_workTitle = remakeString($(".backInfoTxt1").text(), "title");
        const tmp_episodeNumber = remakeString($(".backInfoTxt2").text(), "episodeNumber");

        const danime = {
            workTitle: tmp_workTitle,
            episodeNumber: tmp_episodeNumber,
            episodeTitle: remakeString($(".backInfoTxt3").text(), "title"),
            number: title2number(tmp_episodeNumber),
            splitedTitle: tmp_workTitle.split(GLOBAL_sep),
            workId: location.href.match(/(?<=partId=)\d{5}/)[0]
        };//partId=20073001
        const result_nodes = await fetchWork(danime.splitedTitle[0])
            .then(d => d.map(dd => dd.node));
        if (result_nodes.length == 0) {
            showMessage("No Hit Title: " + danime.workTitle);
            await post2webhook({ danime: danime, error: "noWorkMatched" });
            return;
        }
        let goodWorkNodes = await checkTitleWithWorkId(danime.workId, result_nodes);
        const workIdIsFound = (goodWorkNodes.length != 0);
        if (!workIdIsFound) {
            const checkTitleLengths = result_nodes.map(node => checkTitle([node.title, danime.workTitle], "length")) // node.Title in danime.workTitle
            const checkTitleLength_max = checkTitleLengths.reduce((acc, cur) => Math.max(acc, cur));
            goodWorkNodes = result_nodes.filter((_, ind) => checkTitleLengths[ind] == checkTitleLength_max);
        }
        console.log(goodWorkNodes);

        let combinedEpisodeNode = [];
        for (const workNode of goodWorkNodes) combinedEpisodeNode.push(...workNode.episodes.edges.map(d => d.node));
        let sendResult = false;
        const episodes_numberAndCheck = combinedEpisodeNode.map(episode_node =>
            [workIdIsFound,
                checkTitle([danime.episodeTitle, episode_node.title], "every"),
                (episode_node.number || episode_node.sortNumber) == danime.number, episode_node]);
        const episodes_judges = episodes_numberAndCheck.map(d =>
            [d[0] && d[1] && d[2], // workId is found and episode title & number corresponds
            d[0] && d[1], // workId is found and episode title corresponds
            d[0] && d[2], // workId is found and episode number corresponds
            d[1], // episode title corresponds
            d[3]]); // episode node
        const judge_kinds = 4;
        const valid_check_methods = [...Array(judge_kinds).keys()].filter(num => episodes_judges.filter(d => d[num]).length > 0);
        if (valid_check_methods.length > 0) {
            const episode_node = episodes_judges.filter(d => d[valid_check_methods[0]])[0][judge_kinds];
            if (GLOBAL_storage.annictSend) {
                const status = await postRecord(episode_node.annictId);
                showMessage(`${danime.workTitle} ${danime.episodeNumber} Annict sending ${status ? 'successed' : 'failed'}.`);
            }
            sendResult = true;
        }
        if (!sendResult) showMessage(`${danime.workTitle} ${danime.episodeNumber} Annict sendiing failed.`);
        const error_messages = [[!sendResult, "noEpisodeMatched"], [!workIdIsFound, "noWorkId"]].filter(d => d[0]);
        if (error_messages.length > 0) { // error or workId未登録の場合に指定したURLにwebhookを送信
            await post2webhook({ danime: danime, error: error_messages.map(d => d[1]).join(" ") });
        } else await post2webhook({ danime: danime, error: "none" });

        GLOBAL_notSent = false;
    }

    function showMessage(message) {
        dsaDialog.text(message);
        dsaDialog.hide().fadeIn('slow', () =>
            setTimeout(() => {
                dsaDialog.fadeOut('slow')
            }, 5000)
        )
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
    const titles_splited = titles.map(d => remakeString(d, "title").split(GLOBAL_sep).filter(dd => dd));
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
            .then(db_reader=>new TextDecoder("utf-8").decode(db_reader.value));

        const danime_info = $("tr", db_html).toArray()
            .map(el => [$("td:eq(1)", el).text(), $("td:eq(5)", el).text()])
            .filter(d => d[0].indexOf("241") != -1)
            .map(d => d.map(dd => dd.match(/\d+/)[0]))[0];
        if (!danime_info) continue;
        if (danime_workId == danime_info[1]) good_nodes.push(work_node);
    }
    return good_nodes;
}

async function postRecord(episodeId) {
    // AnnictへのPOST
    const url = `https://api.annict.com/v1/me/records?episode_id=${episodeId}&access_token=${GLOBAL_access_token}`;
    return await fetch(url, { method: "POST" }).then(res => res.status);
}

async function post2webhook(args_dict) {
    console.log("webhook")
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
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
    for (const webhookSetting of GLOBAL_storage.webhookSettings) {
        let postData = {};
        if (webhookSetting.webhookContentChanged) {
            const postJson = webhookSetting.webhookContent;
            postData = Object.entries(postJson).reduce((obj, kv) => {
                const val = kv[1].replace(/\{[^\{]+\}/g, s_in => {
                    s=s_in.slice(1,-1);
                    if (Object.keys(origPostData).indexOf(s) != -1) return origPostData[s];
                    else return s;
                });
                return Object.assign(obj, { [kv[0]]: val });
            }, {});
        } else postData = origPostData;
        if (!Object.entries(webhookMatchingObj).some(kv => origPostData.error.indexOf(kv[0]) != -1 && webhookSetting[kv[1]])) continue;
        let options={ method: "POST", headers:headers, body: JSON.stringify(postData) };
        if (webhookSetting.postUrl.indexOf("://script.google.com/macros/")!=-1) options.mode="no-cors";
        const res=await fetch(webhookSetting.postUrl, options);
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
    }`.replace(/\n/g, "");
    const graphql_url = `https://api.annict.com/graphql?query=${query}`;
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


