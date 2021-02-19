

const GLOBAL_sep = /\s+|;|・|\(|（|\)|）|～|‐|-|―|－|&|＆|#|＃|映画\s*|劇場版\s*|!|！|\?|？|…|『|』|「|」|∬/g;
let dsaDialog;

// webhook default settings
const webhookDefaultSetting = {
    postUrl: "", webhookNoMatched: true,
    webhookNoWorkId: false, webhookSuccess: false, webhookContentChanged: false, webhookContent: {}
};
const webhookDefaultString = JSON.stringify({ [Date.now()]: webhookDefaultSetting });

// option
const checkValid= Object.assign(...["danime", "amazon", "netflix", "abema"].map(key=>Object({[`valid_${key}`]:true})))
const inputObj = Object.assign({token: "", sendingTime: 300, annictSend: true,
 withTwitter: false, withFacebook: false, webhookSettings: webhookDefaultString }, checkValid);

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
    $("<div>").addClass("dsa-dialog").text("Message").appendTo("body");
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
    let RecordSend = true;
    let workInfo = {};
    const videoSite=Object.entries({
        danime:"https://anime.dmkt-sp.jp/animestore/sc_d_pc?partId", // for danime
        amazon:"https://www.amazon.co.jp/gp/video/detail/", // for Amazon Prime
        amazon:"https://www.amazon.co.jp/dp/", // for Amazon Prime
        netflix:"https://www.netflix.com/episode/", // for Netflix
        abema:"https://abema.tv/video/episode/"})  // abemaTV
        .filter(kv=>location.href.indexOf(kv[1])!=-1).map(kv=>kv[0])[0];

    let video;
    const videoSearching=setInterval(function(){
        video = (videoSite=="danime") ? $("#video").get(0) : $("video[width='100%']")[0];
        if (video!=null) {
            clearInterval(videoSearching);
            video.addEventListener("play", async function () {
                console.log("start")
                RecordSend = true;
                const WatchingEpisode =obtainWatching(videoSite);
                console.log(WatchingEpisode)
                await obtainWork(WatchingEpisode).then(async workInfo => {
                    console.log(workInfo);
                    if (workInfo == {} || workInfo.nodes == []) {
                        const error_message = `No Hit Title: ${workInfo.danime.workTitle}`;
                        if (GLOBAL_access_token) showMessage(error_message);
                        await post2webhook(workInfo.webhook);
                    } 
                    setTimeout(async () => { // in 5 min until video started
                        if (workInfo!={} && workInfo.nodes !=[]){
                            await sendRecord(workInfo, WatchingEpisode, RecordSend);
                        }
                        chrome.storage.sync.set({ lastWatched: JSON.stringify(WatchingEpisode), lastVideoOver: false });
                        RecordSend=false;
                    });
                }, GLOBAL_storage.sendingTime * 1000)
            }, {once:true});
        
            video.addEventListener("ended", async () => { // video ended
                const WatchingEpisode = obtainWatching(videoSite);
                if (workInfo!={} && workInfo.nodes != []) {
                    await sendRecord(workInfo, WatchingEpisode, RecordSend);
                }
                chrome.storage.sync.set({ lastWatched: JSON.stringify(WatchingEpisode), lastVideoOver: true });
                // 最後まで見た場合, lastVideoOver=trueで把握
            });
            /*const nextButton = $(".nextButton").get(0)
            nextButton.addEventListener("click", () => { // video skipped
                sendAnnict();
            });*/
        }
    }, 1000)
    
    


    async function sendRecord(workInfo, WatchingEpisode, RecordSend=true) {
        if (!RecordSend || workInfo=={} || workInfo.nodes==[]) return ;
        chrome.storage.sync.get({ lastWatched: JSON.stringify({}), lastVideoOver: false }, async item => {
            const lastWatched = JSON.parse(item.lastWatched);
            const IsSuspended = (WatchingEpisode == lastWatched) && !item.lastVideoOver;
            const IsSameMovie = (workInfo.nodes.some(d => d.media == "MOVIE")) && (lastWatched.workTitle == WatchingEpisode.workTitle);
            const IsSplitedEpisode = Object.entries({ workTitle: true, episodeTitle: true, episodeNumber: false, number: true })
                .every(kv => kv[1] == (lastWatched[kv[0]] == WatchingEpisode[kv[0]]));
            //console.log({ RecordSend, IsSuspended, IsSameMovie, IsSplitedEpisode })
            if (!IsSuspended || !IsSameMovie || !IsSplitedEpisode) {
                await post2webhook(workInfo.webhook);
                await sendAnnict(workInfo);
            }
        })
    }
    function obtainWatching(videoSite="danime"){
        if (videoSite=="danime"){
            return {
                site:videoSite,
                workTitle: $(".backInfoTxt1").text(),
                episodeTitle: $(".backInfoTxt3").text(),
                episodeNumber: $(".backInfoTxt2").text(),
                number: title2number(remakeString($(".backInfoTxt2").text(), "episodeNumber")),
                workId: location.href.match(/(?<=partId=)\d{5}/)[0],
                workIds: []
            };
        } else if (videoSite=="amazon"){
            const workTitle=$("h1[data-automation-id='title']").text();
            // obtain episode numbers
            const candidates_tmp=$("h2");
            const candidates=[...Array(candidates_tmp.length).keys()].map(ind=>candidates_tmp[ind]);
            const seasonAndEpisode=candidates.reduce((acc,cand)=>{
                if (cand.class.indexOf("subtitle")!=-1){
                    return acc.concat([cand.textContent]);
                } else return acc;
            }, []);
            if (seasonAndEpisode.length!=1) return {};
            const episodeWriting=seasonAndEpisode[0].match(/(?<=シーズン\d+、エピソード\d+\s).*/);
            if (episodeWriting.length==0) return {};
            const episodeNumebrInd_candidates=episodeWriting[0].split(" ").map((d,ind)=>[ind,d])
            .filter(d=>isFinite(title2number(remakeString(d[1], "episodeNumber"))))
            if (episodeNumebrInd_candidates.length==0) return {};
            const episodeNumebrInd=Math.min(...episodeNumebrInd_candidates.map(d=>d[0]));
            // obtain detail scripts
            const script_candidates_tmp=$("script[type='text/template']");
            const script_candidates=[...Array(script_candidates_tmp.length).keys()].map(ind=>script_candidates_tmp[ind]);
            const scripts=script_candidates.reduce((acc,cand)=>{
                /* if (cand.innerHTML.indexOf(`{"props":{"state":{"features":{"enable`)!=-1){
                    return Object.assign(acc, {enable: JSON.parse(cand.textContent)});
                } else */ if(cand.innerHTML.indexOf(`{"props":{"state":{"features":{"isElcano`)!=-1) {
                    return Object.assign(acc, {isElcano:JSON.parse(cand.textContent)})
                } else return acc;
            }, {});
            const workId=scripts.isElcano.props.state.pageTitleId;
            const workIds=scripts.isElcano.props.state.self[workId].asins;
            return {
                site:videoSite,
                workTitle: workTitle,
                episodeTitle: episodeWriting[0].split(" ").slice(episodeNumebrInd+1).join(" "),
                episodeNumber:episodeWriting[0].split(" ")[episodeNumebrInd],
                number:title2number(remakeString(episodeWriting[0].split(" ")[episodeNumebrInd], "episodeNumber")),
                workId:workId,
                workIds:workIds
            }
        } else if (videoSite=="netflix"){
            const titleArea=$(".video-title>div");
            const workTitle=$("h4", titleArea).text();
            const episodeWriting=[$("span:eq(1)", titleArea).text()];
            return {
                site:videoSite,
                workTitle: workTitle,
                episodeTitle: episodeWriting[0].split(" ").slice(episodeNumebrInd+1).join(" "),
                episodeNumber:episodeWriting[0].split(" ")[episodeNumebrInd],
                number:title2number(remakeString(episodeWriting[0].split(" ")[episodeNumebrInd], "episodeNumber")),
                workId:workId,
                workIds:[]
            }
        } else if (videoSite=="abema"){
            const candidates=$("script[type='application/ld+json']");
            const jsonData=JAONS.parse(candidates).itemListElement;
            if (jsonData[1].name!="アニメ") return {}; // require アニメ
            const workTitle=jsonData[2].name;
            const episodeWriting=[jsonData[3].name];
            const episodeNumebrInd_candidates=episodeWriting[0].split(" ").map((d,ind)=>[ind,d])
            .filter(d=>isFinite(title2number(remakeString(d[1], "episodeNumber"))))
            if (episodeNumebrInd_candidates.length==0) return {};
            const episodeNumebrInd=Math.min(...episodeNumebrInd_candidates.map(d=>d[0]));
            const workId=location.href.match(/(?<=abema\.tv\/video\/episode\/)[^_]+)/)[0];
            return {
                site:videoSite,
                workTitle: workTitle,
                episodeTitle: episodeWriting[0].split(" ").slice(episodeNumebrInd+1).join(" "),
                episodeNumber:episodeWriting[0].split(" ")[episodeNumebrInd],
                number:title2number(remakeString(episodeWriting[0].split(" ")[episodeNumebrInd], "episodeNumber")),
                workId:workId,
                workIds:[]
            }
        } 
        else return {};
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
                    site:WatchingEpisode.site,
                    workTitle: WatchingEpisode.workTitle,
                    episodeTitle: "",
                    episodeNumber: `${episodeNumber}`,
                    number: episodeNumber,
                    workId: WatchingEpisode.workId,
                    workIds: WatchingEpisode.workIds
                }
                const workInfoTmp = await identifyWork(episodeNow);
                if (workInfoTmp != {}) workInfos.push(workInfoTmp);
            }
            const errorMessage = Array.from(new Set(workInfos.map(d => d.webhook.error))).sort().join(" ");
            return { webhook: { danime: WatchingEpisode, error: errorMessage }, nodes: [].concat(...workInfos.map(d => d.nodes)) };
        }
    }
    async function identifyWork(WatchingEpisode) {

        const danime = {
            site:WatchingEpisode.site,
            workTitle: WatchingEpisode.workTitle,
            episodeTitle: remakeString(WatchingEpisode.episodeTitle, "title"),
            episodeNumber: remakeString(WatchingEpisode.episodeNumber, "episodeNumber"),
            number: WatchingEpisode.number,
            splitedTitle: WatchingEpisode.workTitle.split(GLOBAL_sep).filter(d => !/^\s*$/.test(d)),
            workId: WatchingEpisode.workId,
            workIds: WatchingEpisode.workIds
        };
        // Annict TokenがなくてもWebhookは実行できるように変更
        if (!GLOBAL_access_token) return { danime: danime, nodes: [], webhook: { danime: danime, error: "noAnnictToken" } };
        const result_nodes = await fetchWork(danime.splitedTitle[0])
            .then(d => d.map(dd => dd.node));
        //console.log(result_nodes)
        if (result_nodes.length == 0) {
            return { danime: danime, nodes: [], webhook: { danime: danime, error: "noWorkMatched" } }
        }
        let goodWorkNodes = await checkTitleWithWorkId(danime, result_nodes);
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
            .filter(d => d[0]).map(d => d[1]).join(" ") || "none";
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


async function checkTitleWithWorkId(danime, work_nodes) {
    //現状、vod情報はREST APIやgraphQLから取得できない。(存在はしている)
    const videoSite=danime.site;
    const vod_dic={danime:241, amazon:243};
    let good_nodes = [];
    for (const work_node of work_nodes) {
        const annictId = work_node.annictId

        const db_url = `https://api.annict.com/db/works/${annictId}/programs`;
        const db_html = await fetch(db_url).then(d => d.body)
            .then(d => d.getReader()).then(reader => reader.read())
            .then(db_reader => new TextDecoder("utf-8").decode(db_reader.value));

        const danime_info = $("tr", db_html).toArray()
            .map(el => [$("td:eq(1)", el).text(), $("td:eq(5)", el).text()])
            .filter(d => d[0].indexOf(vod_dic[videoSite]) != -1)
            .map(d => d[1].match(/\S+/));
        if (danime_info.length == 0) continue;
        //console.log(danime_info[0][0], danime.workIds, danime.workIds.indexOf(danime_info[0][0]))
        if (danime.site=="danime" && danime_info[0][0]==danime.workId) good_nodes.push(work_node);
        else if (danime.site=="amazon" && danime.workIds.indexOf(danime_info[0][0])!=-1) good_nodes.push(work_node);
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
        danimeWorkId: danime.workId, 
        site:danime.site, error: args_dict.error
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
    const reg = new RegExp(`[${const_kanji.num.char}${const_kanji.mag1.char}][${const_kanji.num.char}${const_kanji.mag1.char}${const_kanji.mag2.char}]*`, "g");
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


