

const GLOBAL_sep = /\s+|;|・|\(|（|\)|）|～|‐|-|―|－|&|＆|#|＃|映画\s*|劇場版\s*|!|！|\?|？|…|『|』|「|」|∬/g;

// webhook default settings
const webhookDefaultSetting = {
    postUrl: "", webhookNoMatched: true,
    webhookNoWorkId: false, webhookSuccess: false, webhookContentChanged: false, webhookContent: {}
};
const webhookDefaultString = JSON.stringify({ [Date.now()]: webhookDefaultSetting });

// option
const checkValid1 = Object.assign({ "valid_danime": true }, ...["amazon", "abema"].map(key => Object({ [`valid_${key}`]: false })))
const checkValid2 = Object.assign(...["danime", "amazon", "abema"].map(key =>
    Object({ [`valid_${key}Annict`]: true, [`valid_${key}Webhook`]: true, [`valid_${key}Genre`]: false })));
const checkValid = Object.assign(checkValid1, checkValid2);
const inputObj = Object.assign({
    token: "", sendingTime: 300, annictSend: true,
    withTwitter: false, withFacebook: false, webhookSettings: webhookDefaultString
}, checkValid);

function showMessage(message, dialog_in) {
    const dialog = (dialog_in) ? dialog_in : $(".dsa-dialog");
    dialog.text(message);
    dialog.hide().fadeIn("slow", () =>
        setTimeout(() => {
            dialog.fadeOut("slow")
        }, 5000)
    )
}

$(async function () {
    $("<style>", { type: 'text/css' })
        .append(".dsa-dialog { position: fixed;  bottom: 60px;  right: 10px; border: 1px solid #888888;  padding: 2pt;  background-color: #ffffff;  filter: alpha(opacity=85);  -moz-opacity: 0.85;  -khtml-opacity: 0.85;  opacity: 0.85;      text-shadow: 0 -1px 1px #FFF, -1px 0 1px #FFF, 1px 0 1px #aaa;  -webkit-box-shadow: 1px 1px 2px #eeeeee;  -moz-box-shadow: 1px 1px 2px #eeeeee;  -webkit-border-radius: 3px;  -moz-border-radius: 3px; display: none;}")
        .appendTo("head");
    $("<div>", { class: "dsa-dialog" }).text("Message").appendTo("body");

    chrome.storage.sync.get({ token: "" }, items => {
        if (items.token == "") showMessage("There is no access token of `Annict`.");
    })


    //let firstSendingAmazon = true;
    const functionForInterval = async function (WatchingEpisodeLast, items) {
        const videoSite = Object.entries({
            danime: "https://anime.dmkt-sp.jp/animestore/sc_d_pc?partId", // for danime
            amazon: "https://www.amazon.co.jp/gp/video/detail/", // for Amazon Prime
            amazon_: "https://www.amazon.co.jp/dp/", // for Amazon Prime 2
            netflix: "https://www.netflix.com/episode/", // for Netflix
            abema: "https://abema.tv/video/" // for abemaTV
        }).filter(kv => location.href.indexOf(kv[1]) != -1).map(kv => kv[0])[0].replace(/_*$/, "");
        const WatchingEpisode = obtainWatching(videoSite, items[`valid_${videoSite}Genre`]);
        const WatchingEpisodeNow = JSON.stringify(WatchingEpisode);
        //console.log(WatchingEpisodeNow, videoSite)

        async function mainFunc(WatchingEpisode, video) {
            let RecordWillBeSent = true;
            await videoTriggered("start", WatchingEpisode, true).then(d => {
                WorkInfo = d;
                RecordWillBeSent = false;
            })
            video.addEventListener("ended", async () => { // video ended
                await videoTriggered("end", WatchingEpisode, RecordWillBeSent, workInfo)
            })
        }

        if (WatchingEpisodeNow != WatchingEpisodeLast) {
            //console.log(WatchingEpisodeNow);
            const video = obtainVideoElement(videoSite);
            // video要素がないなら最初から
            // 通信が途切れてるときに{}が返されることも
            if (video == null || WatchingEpisodeNow == "{}") return WatchingEpisodeLast;
            // amazon prime videoは一覧ページで既に「続きのエピソード」のvideoなどが用意されているので、実際の再生まで待機
            // played.lengthで判断したのはとてもよかった！
            if (videoSite == "amazon" && video.played.length == 0) return WatchingEpisodeLast;
            // danime, abemaは作品内容が変化していればよし
            // また、abemaは一覧からエピソードを再生した場合、playやplayingを取得できないので、
            // videoの挙動とは無関係に進める形に
            else await mainFunc(WatchingEpisode, video);
        } return WatchingEpisodeNow;
    }

    const interval = async (WatchingEpisodeLast = "{}", items) => {
        await functionForInterval(WatchingEpisodeLast, items)
            .then(WatchingEpisodeLast => {
                setTimeout(interval, 2 * 1000, WatchingEpisodeLast, items)
            });
    }
    chrome.storage.sync.get(checkValid2, async items => {
        await interval("{}", items);
    })
})


// ------------------------- functions for main ------------------------

const obtainVideoElement = (site) => {
    if (site == "danime") return $("#video")[0];
    else if (site == "amazon") return $("video[width='100%']")[0];
    else if (site == "netflix") return $("video")[0];
    else if (site == "abema") return $("video[preload='metadata']")[0];
}


async function videoTriggered(flag, WatchingEpisode, RecordWillBeSent = true, workInfo = {}) {
    console.log("start");
    console.log("Watching:\n", WatchingEpisode);
    if (flag == "start") {
        chrome.storage.sync.get({ token: "", sendingTime: 300 }, async items => {
            if (items.token == "") return;
            const sendingTime = (items.sendingTime - 0 > 0) ? items.sendingTime : 300;

            await obtainWork(WatchingEpisode, items.token).then(async workInfo => {
                console.log("Work Information:\n", workInfo);
                if (workInfo == {} || workInfo.nodes == []) {
                    const error_message = `No Hit Title: ${workInfo.WatchingEpisode.workTitle}`;
                    showMessage(error_message);
                    await post2webhook(workInfo.webhook);
                }
                setTimeout(async () => { // in 5 min until video started
                    if (workInfo != {} && workInfo.nodes != []) {
                        await sendRecord(workInfo, WatchingEpisode, RecordWillBeSent);
                    }
                    chrome.storage.sync.set({ lastWatched: JSON.stringify(WatchingEpisode), lastVideoOver: false });
                }, sendingTime * 1000);
            })
        })

    } else if (flag == "end") {
        if (workInfo != {} && workInfo.nodes != []) {
            await sendRecord(workInfo, WatchingEpisode, RecordWillBeSent);
        }
        chrome.storage.sync.set({ lastWatched: JSON.stringify(WatchingEpisode), lastVideoOver: true });
        // 最後まで見た場合, lastVideoOver=trueで把握
    }
    return workInfo;
}


async function sendRecord(workInfo, WatchingEpisode, RecordWillBeSent = true) {
    if (!RecordWillBeSent || workInfo == {} || workInfo.nodes == []) return;
    chrome.storage.sync.get(Object.assign({ lastWatched: JSON.stringify({}), lastVideoOver: true }, inputObj), async items => {
        const lastWatched = JSON.parse(items.lastWatched);
        //console.log({lastWatched, WatchingEpisode})
        const IsSuspended = (JSON.stringify(WatchingEpisode) == JSON.stringify(lastWatched)) && !items.lastVideoOver;
        const IsSameMovie = (workInfo.nodes.some(d => d.media == "MOVIE")) && (lastWatched.workTitle == WatchingEpisode.workTitle);
        const IsSplitedEpisode = Object.entries({ workTitle: true, episodeTitle: true, episodeNumber: false, number: true })
            .every(kv => kv[1] == (lastWatched[kv[0]] == WatchingEpisode[kv[0]]));
        console.log("Sending Condition:\n", { RecordWillBeSent, IsSuspended, IsSameMovie, IsSplitedEpisode })
        if (!IsSuspended && !IsSameMovie && !IsSplitedEpisode) {
            await post2webhook(workInfo.webhook, items);
            await sendAnnict(workInfo, items);
        }
    })
}

function obtainWatching(videoSite, genreLimit = true) {
    if (videoSite == "danime") {
        return {
            site: videoSite,
            workTitle: $(".backInfoTxt1").text(),
            episodeTitle: $(".backInfoTxt3").text(),
            episodeNumber: $(".backInfoTxt2").text(),
            number: title2number(remakeString($(".backInfoTxt2").text(), "episodeNumber")),
            genre: "アニメ",
            workId: location.href.match(/(?<=partId=)\d{5}/)[0],
            workIds: []
        };
    } else if (videoSite == "amazon") {
        const workTitle = $("h1[data-automation-id='title']").text();
        // obtain detail scripts
        const script_candidates_tmp = $("script[type='text/template']");
        const script_candidates = [...Array(script_candidates_tmp.length).keys()].map(ind => script_candidates_tmp[ind]);
        const scripts = script_candidates.reduce((acc, cand) => {
            /* if (cand.innerHTML.indexOf(`{"props":{"state":{"features":{"enable`)!=-1){
                return Object.assign(acc, {enable: JSON.parse(cand.textContent)});
            } else */ if (cand.innerHTML.indexOf(`{"props":{"state":{"features":{"isElcano`) != -1) {
                return Object.assign(acc, { isElcano: JSON.parse(cand.textContent) })
            } else return acc;
        }, {});
        const workId = scripts.isElcano.props.state.pageTitleId;
        const workIds = scripts.isElcano.props.state.self[workId].asins;
        const detailData = (scripts.isElcano.props.state.detail.detail[workId] ||
            scripts.isElcano.props.state.detail.headerDetail[workId]);
        const genres = detailData.genres.map(d => d.text);
        //console.log(detailData, genres)
        if (genres.indexOf("アニメ") == -1 && genreLimit) return {};

        // obtain episode numbers
        const candidates_tmp = $("h2");
        const candidates = [...Array(candidates_tmp.length).keys()].map(ind => candidates_tmp[ind]);
        const seasonAndEpisode = candidates.reduce((acc, cand) => {
            if (Array.from(cand.classList).join(" ").indexOf("subtitle") != -1) {
                return acc.concat([cand.textContent]);
            } else return acc;
        }, []);

        if (seasonAndEpisode.length != 1) return {};
        const episodeWriting = seasonAndEpisode[0].match(/(?<=シーズン\d+、エピソード\d+\s).*/);
        if (episodeWriting == null || episodeWriting.length == 0) return {};
        const episodeNumebrInd_candidates = episodeWriting[0].split(" ").map((d, ind) => [ind, d])
            .filter(d => isFinite(title2number(remakeString(d[1], "episodeNumber"))))
        if (episodeNumebrInd_candidates.length == 0) return {};
        const episodeNumebrInd = Math.min(...episodeNumebrInd_candidates.map(d => d[0]));

        return {
            site: videoSite,
            workTitle: workTitle,
            episodeTitle: episodeWriting[0].split(" ").slice(episodeNumebrInd + 1).join(" "),
            episodeNumber: episodeWriting[0].split(" ")[episodeNumebrInd],
            number: title2number(remakeString(episodeWriting[0].split(" ")[episodeNumebrInd], "episodeNumber")),
            genre: genres.join(" "),
            workId: workId,
            workIds: workIds
        }
    } else if (videoSite == "netflix") {
        const titleArea = $(".video-title>div");
        const workTitle = $("h4", titleArea).text();
        const episodeWriting = [$("span:eq(1)", titleArea).text()];
        return {
            site: videoSite,
            workTitle: workTitle,
            episodeTitle: episodeWriting[0].split(" ").slice(episodeNumebrInd + 1).join(" "),
            episodeNumber: episodeWriting[0].split(" ")[episodeNumebrInd],
            number: title2number(remakeString(episodeWriting[0].split(" ")[episodeNumebrInd], "episodeNumber")),
            genres: "アニメ",
            workId: workId,
            workIds: []
        }
    } else if (videoSite == "abema") {
        const candidates = $("script[type='application/ld+json']");
        const jsonData = JSON.parse(candidates[candidates.length - 1].innerHTML).itemListElement;
        //console.log(jsonData)
        if (!jsonData || jsonData.length < 4 || (jsonData[1].name != "アニメ" && genreLimit)) return {}; // require アニメ
        const genre = jsonData[1].name;
        const workTitle = jsonData[2].name;
        const episodeWriting = [jsonData[3].name];
        const episodeNumebrInd_candidates = episodeWriting[0].split(" ").map((d, ind) => [ind, d])
            .filter(d => isFinite(title2number(remakeString(d[1], "episodeNumber"))))
        if (episodeNumebrInd_candidates.length == 0) return {};
        const episodeNumebrInd = Math.min(...episodeNumebrInd_candidates.map(d => d[0]));
        const workId = location.href.match(/(?<=abema\.tv\/video\/episode\/)[^_]+/)[0];
        return {
            site: videoSite,
            workTitle: workTitle,
            episodeTitle: episodeWriting[0].split(" ").slice(episodeNumebrInd + 1).join(" "),
            episodeNumber: episodeWriting[0].split(" ")[episodeNumebrInd],
            number: title2number(remakeString(episodeWriting[0].split(" ")[episodeNumebrInd], "episodeNumber")),
            genre: genre,
            workId: workId,
            workIds: []
        }
    }
    else return {};
}

// -------------- find work -----------------

async function obtainWork(WatchingEpisode, annictToken) {
    const IsCombinedEpisode = (/～|／/.test(WatchingEpisode.episodeNumber) &&
        WatchingEpisode.episodeNumber.split(/～|／/g).every(d => title2number(remakeString(d, "episodeNumber"))) != null);
    if (!IsCombinedEpisode) {
        return await identifyWork(WatchingEpisode, annictToken);
    } else {
        const splited_episodeNumbers = WatchingEpisode.episodeNumber.split(/～|／/g)
            .map(d => title2number(remakeString(d, "episodeNumber")));
        const episodeRange = [splited_episodeNumbers[0], splited_episodeNumbers.slice(-1)[0]];
        const episodeNumbers = [...Array(episodeRange[1] - episodeRange[0] + 1).keys()].map(num => num + episodeRange[0]);
        let workInfos = [];
        for (const number of episodeNumbers) {
            const episodeNow = Obejct.assign({
                episodeTitle: "",
                episodeNumber: `${number}`,
                number: number
            }, ...["site", "workTitle", "genre","workId", "workIds"]
                .map(key=>Object({[key]: WatchingEpisode[key]})))

            const workInfoTmp = await identifyWork(episodeNow, annictToken);
            if (workInfoTmp != {}) workInfos.push(workInfoTmp);
        }
        const errorMessage = Array.from(new Set(workInfos.map(d => d.webhook.error))).sort().join(" ");
        return { webhook: { WatchingEpisode: WatchingEpisode, error: errorMessage }, nodes: [].concat(...workInfos.map(d => d.nodes)) };
    }
}

async function identifyWork(WatchingEpisode, annictToken) {
    const remake={
        episodeTitle:remakeString(WatchingEpisode.episodeTitle, "title"),
        splitedTitle: WatchingEpisode.workTitle.split(GLOBAL_sep).filter(d => !/^\s*$/.test(d))};
    const result_nodes = await fetchWork(remake.splitedTitle[0], annictToken);
    //console.log(result_nodes)
    if (result_nodes.length == 0) {
        return { WatchingEpisode: WatchingEpisode, nodes: [], webhook: { WatchingEpisode: WatchingEpisode, error: "noWorkMatched" } }
    }
    const goodWorkNodesTmp = await checkTitleWithWorkId(WatchingEpisode, result_nodes);
    const workIdIsFound = (goodWorkNodesTmp.length != 0);
    const goodWorkNodes = (workIdIsFound) ? goodWorkNodesTmp : result_nodes;
    console.log("Work Candidates:\n", goodWorkNodes);

    const combinedEpisodeNode = [].concat(...goodWorkNodes.map(workNode => {
        if (workNode.episodes.edges.length > 0) {
            const episodeNodes = workNode.episodes.edges.map(d => d.node);
            const unitNum = Math.min(...episodeNodes.map(d => d.sortNumber).filter(d => d > 0));
            return episodeNodes.map(d => {
                d.sortNumber = d.sortNumber / unitNum;
                return d;
            })
        }
        else return { title: workNode.title, number: "", annictId: workNode.annictId, media: workNode.media, IsZeroEpisode: true }; // only 0 episode
    }));
    const episodes_numberAndCheck = combinedEpisodeNode.map(episode_node =>
        [workIdIsFound,
            checkTitle([remake.episodeTitle, episode_node.title], "every"),
            (episode_node.number || episode_node.sortNumber) == WatchingEpisode.number]);
    const episodes_judges = episodes_numberAndCheck.map(d =>
        [d[0] && d[1] && d[2], // workId is found and episode title & number corresponds
        d[0] && d[1], // workId is found and episode title corresponds
        d[0] && d[2], // workId is found and episode number corresponds
        d[1] && d[2], // episode title and number corresponds
        d[1], // episode title corresponds
        d[2]]); // episode number corresponds
    const judge_kinds = episodes_judges[0].length;
    const valid_check_methods = [...Array(judge_kinds).keys()].filter(num => episodes_judges.filter(d => d[num]).length > 0);
    //console.log(WatchingEpisode, combinedEpisodeNode, episodes_numberAndCheck)
    const error_messages = [[valid_check_methods.length == 0, "noEpisodeMatched"], [!workIdIsFound, "noWorkId"]]
        .filter(d => d[0]).map(d => d[1]).join(" ") || "none"; // なにもなければnone
    if (valid_check_methods.length > 0) {
        const episode_node = episodes_judges.map((d, ind) => [d[valid_check_methods[0]], combinedEpisodeNode[ind]])
            .filter(d => d[0]).map(d => d[1])[0];
        const webhookContent = { WatchingEpisode: WatchingEpisode, error: error_messages };
        return { WatchingEpisode: WatchingEpisode, nodes: [episode_node], webhook: webhookContent };
    } else {
        return {
            WatchingEpisode: WatchingEpisode, nodes: [],
            webhook: { WatchingEpisode: WatchingEpisode, error: error_messages }
        };
    }
}

async function checkTitleWithWorkId(WatchingEpisode, work_nodes) {
    //現状、vod情報はREST APIやgraphQLから取得できない。(存在はしている)
    const videoSite = WatchingEpisode.site;
    const vod_dic = { danime: 241, amazon: 243, netflix: 244, abema: 260 };
    let good_nodes = [];
    for (const work_node of work_nodes) {
        const annictId = work_node.annictId;

        const db_url = `https://api.annict.com/db/works/${annictId}/programs`;
        const db_html = await fetch(db_url).then(d => d.body)
            .then(d => d.getReader()).then(reader => reader.read())
            .then(db_reader => new TextDecoder("utf-8").decode(db_reader.value));

        const danime_info = $("tr", db_html).toArray()
            .map(el => [$("td:eq(1)", el).text(), $("td:eq(5)", el).text()])
            .filter(d => d[0].indexOf(vod_dic[videoSite]) != -1)
        if (danime_info.length == 0 || danime_info.filter(d => d[1].match(/\S+/)).length == 0) continue;
        const danime_info_ids = danime_info.map(d => d[1].match(/\S+/)).map(d => d[0]); // idは複数存在しうる
        //console.log(annictId, danime_info_id, WatchingEpisode.workIds, danime_info)
        if (["danime", "abema", "netflix"].indexOf(WatchingEpisode.site) != -1 && danime_info_ids.some(id => id == WatchingEpisode.workId)) good_nodes.push(work_node);
        else if (WatchingEpisode.site == "amazon" && danime_info_ids.some(id => WatchingEpisode.workIds.indexOf(id) != -1)) good_nodes.push(work_node);
    }
    return good_nodes;
}


async function fetchWork(title, annictToken) {
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
        'Authorization': `Bearer ${annictToken}`
    };
    return await fetch(graphql_url, { method: "POST", headers: headers })
        .then(res => res.json())
        .then(jsoned => jsoned.errors ? [] : jsoned.data.searchWorks.edges.map(d => d.node));
}

function remakeString(input_str, mode = "title") {
    if (!input_str) return input_str;
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

// -------------- send record and webhook --------------

async function sendAnnict(workInfo, items) {
    const notSent = (!items.annictSend || !items[`valid_${workInfo.WatchingEpisode.site}Annict`]);
    const IsNotAnime = (workInfo.WatchingEpisode.genre.indexOf("アニメ") != -1)
    if (notSent || IsNotAnime || items.token == "") return;
    console.log("sending to Annict");
    const WatchingEpisode = workInfo.WatchingEpisode;
    let statuses = [];
    for (const node of workInfo.nodes) {
        // AnnictへのPOST
        const IsZeroEpisode = (Object.keys(node).indexOf("IsZeroEpisode") != -1 && node.IsZeroEpisode)
        //作品に対する投稿は、status変更で対応
        const parameters = (IsZeroEpisode) ? { "work_id": node.annictId, kind: "watched", "access_token": items.token }
            : { "episode_id": node.annictId, "access_token": items.token, "share_twitter": items.withTwitter, "share_facebook": items.withFacebook };
        const url = (IsZeroEpisode) ? `https://api.annict.com/v1/me/statuses?${Object.entries(parameters).map(d => d.join("=")).join("&")}`
            : `https://api.annict.com/v1/me/records?${Object.entries(parameters).map(d => d.join("=")).join("&")}`;
        statuses.push(await fetch(url, { method: "POST" }).then(res => res.status));
    }
    const result_message = `${WatchingEpisode.workTitle} ${WatchingEpisode.episodeNumber} Annict sending ${statuses.every(d => d) ? 'successed' : 'failed'}.`;
    console.log(result_message);
    showMessage(result_message);
}


async function post2webhook(args_dict, items) {
    console.log("posting webhook");
    const WatchingEpisode = args_dict.WatchingEpisode;
    if (!items[`valid_${WatchingEpisode.site}Webhook`]) return;
    const webhookSettings_in = items.webhookSettings;
    const origPostData = {
        workTitle: WatchingEpisode.workTitle, episodeNumber: WatchingEpisode.episodeNumber,
        episodeTitle: WatchingEpisode.episodeTitle, vodWorkId: WatchingEpisode.workId,
        danimeWorkId: WatchingEpisode.workId,
        site: WatchingEpisode.site, error: args_dict.error
    };
    const webhookMatchingObj = {
        "noWorkMatched": "webhookNoMatched", "noEpisodeMatched": "webhookNoMatched",
        "noWorkId": "webhookNoWorkId", "none": "webhookSuccess"
    }
    const headers = {
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

    const webhookSettings = checkWebhookSettings(webhookSettings_in);
    for (const webhookSetting of Object.values(webhookSettings)) {
        const postData = (webhookSetting.webhookContentChanged) ?
            Object.entries(webhookSetting.webhookContent).reduce((obj, kv) => {
                const val = kv[1].replace(/\{[^\{]+\}/g, s_in => {
                    s = s_in.slice(1, -1);
                    if (Object.keys(origPostData).indexOf(s) != -1) return origPostData[s];
                    else return s_in;
                });
                return Object.assign(obj, { [kv[0]]: val });
            }, {}) : origPostData;
        //console.log(postData);
        if (!Object.entries(webhookMatchingObj).some(kv => origPostData.error.indexOf(kv[0]) != -1 && webhookSetting[kv[1]])) continue;
        let options = { method: "POST", headers: headers, body: JSON.stringify(postData) };
        if (webhookSetting.postUrl.indexOf("://script.google.com/macros/") != -1) options.mode = "no-cors";
        const res = await fetch(webhookSetting.postUrl, options);
        //console.log(res);
    }
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




