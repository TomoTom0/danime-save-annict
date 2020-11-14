
const GLOBAL_sep = /\s|・|～|‐|-|―|－|&|＆|#|＃/g;
let dsaDialog;

// check access token
let GLOBAL_access_token = "";
chrome.storage.sync.get( { token: "" }, storage => {
        GLOBAL_access_token = storage.token;
        if (GLOBAL_access_token == "") showMessage("The access token of `Annict` does not exist.");
    }
)

window.onload = function () {
    // メッセージ用のボックスをInjectする
    $("<style>", { type: 'text/css' })
        .append(".dsa-dialog { position: fixed;  bottom: 60px;  right: 10px; border: 1px solid #888888;  padding: 2pt;  background-color: #ffffff;  filter: alpha(opacity=85);  -moz-opacity: 0.85;  -khtml-opacity: 0.85;  opacity: 0.85;      text-shadow: 0 -1px 1px #FFF, -1px 0 1px #FFF, 1px 0 1px #aaa;  -webkit-box-shadow: 1px 1px 2px #eeeeee;  -moz-box-shadow: 1px 1px 2px #eeeeee;  -webkit-border-radius: 3px;  -moz-border-radius: 3px; display: none;}")
        .appendTo("head");
    $("<div>").addClass("dsa-dialog").text('Message').appendTo("body");
    dsaDialog = $(".dsa-dialog");

    const video = $("#video").get(0);
    video.addEventListener("loadstart", () => {
        GLOBAL_notSent = true;
        setTimeout(() => { // in 5 min until video started
            sendAnnict();
        }, 5 * 1000)
    });
    video.addEventListener("ended", () => { // video ended
        sendAnnict();
    });
    /*const nextButton = $(".nextButton").get(0)
    nextButton.addEventListener("click", () => { // video skipped
        sendAnnict();
    });*/

    let GLOBAL_notSent = true;

    async function sendAnnict() {
        if (!GLOBAL_access_token || !GLOBAL_notSent) return;
        console.log("send Start");
        const tmp_Title=remakeString($(".backInfoTxt1").text(), "title");
        const tmp_EpisodeNumber=remakeString($(".backInfoTxt2").text(), "episodeNumber");

        const danime = {
            Title: tmp_Title,
            EpisodeNumber: tmp_EpisodeNumber,
            EpisodeTitle: remakeString($(".backInfoTxt3").text(), "title"),
            Number : title2number(tmp_EpisodeNumber),
            splitedTitle : tmp_Title.split(GLOBAL_sep) };

        const result_nodes = await fetchWork(danime.splitedTitle[0])
            .then(d => d.map(dd => dd.node));
        if (result_nodes.length == 0) {
            showMessage("No Hit Title. " + danime.Title);
            return; }
        const checkTitleLengths = result_nodes.map(node=> checkTitle([node.title, danime.Title], "length") ) // node.Title in danime.Title
        const checkTitleLength_max=checkTitleLengths.reduce( (acc,cur) => Math.max(acc,cur) );
        const result_nodes_filtered=result_nodes.filter((_, ind)=> checkTitleLengths[ind]==checkTitleLength_max);
        console.log(result_nodes_filtered);
        let sendResult = false;
        for (const node of result_nodes_filtered) {
            const episodes_nodes = node.episodes.edges.map(d => d.node);
            if (episodes_nodes.length == 0) console.log("no episodes.");
            for (const episode_node of episodes_nodes) {
                const episode = {
                    Number: title2number(episode_node.numberText),
                    Check: checkTitle([danime.EpisodeTitle, episode_node.title], "every") // danime.EpisodeTitle in episode_node.Title
                };
                if (episode.Number == danime.Number || episode.Check) {
                    const status = await postRecord(episode_node.annictId);
                    showMessage(`${danime.Title} ${danime.EpisodeNumber} Annict send ${status}.`);
                    sendResult = true;
                    break;
                }
            }
            break;
        }
        if (!sendResult) showMessage(`${danime.Title} ${danime.EpisodeNumber} Annict send false.`);
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


function remakeString(input_str,mode="title"){
    const delete_array=["「","」","『","』", "｢", "｣"];
    const remake_dic={"〈":"＜","〉":"＞",
     "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V", "Ⅵ": "VI", "Ⅶ": "VII", "Ⅷ": "VIII", "Ⅸ": "IX", "Ⅹ": "X" };
    if (mode=="episodeNumber"){
        return kanji2arab(input_str).replace(/[０-９]/g, s => // 全角=>半角
            String.fromCharCode(s.charCodeAt(0) - 65248));
    } else if (mode=="title"){
        return input_str.replace(/[Ａ-Ｚａ-ｚ０-９：]/g, s => // 全角=>半角
            String.fromCharCode(s.charCodeAt(0) - 65248))
            .replace(new RegExp(delete_array.join("|"), "g"), "")
            .replace(new RegExp(Object.keys(remake_dic).join("|"), "g"), match=> remake_dic[match] );
    }
}
function title2number(str) {
    if (!str) return "";
    const str2 = str.match(/\d+/);
    return parseInt(str2, 10);
}

function checkTitle(titles, mode="length") {
    if (titles.some(d => !d)) return false;
    const titles_splited = titles.map(d => remakeString(d, "title").split(GLOBAL_sep).filter(dd=>dd));
    if (mode=="length") return titles_splited[0].filter(d => titles_splited[1].join("").indexOf(d) != -1).length;
    else if (mode=="every") return titles_splited[0].every(d => titles_splited[1].join("").indexOf(d) != -1);
}


async function postRecord(episodeId) {
    // AnnictへのPOST
    const url = `https://api.annict.com/v1/me/records?episode_id=${episodeId}&access_token=${GLOBAL_access_token}`;
    return await fetch(url, { method: "POST" }).then(res => res.status);
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
                    episodes(
                        orderBy: { field: SORT_NUMBER, direction: ASC },
                    ) {
                        edges {
                            node {
                            annictId
                            numberText
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
        'Authorization': `Bearer ${GLOBAL_access_token}` };
    const opts = {
        method: "POST",
        headers: headers };
    return await fetch(graphql_url, opts)
        .then(res => res.json())
        .then(jsoned => jsoned.errors ? {} : jsoned.data.searchWorks.edges);
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

//----------------- not used functions ---------------
// not modified

function getWorkId(titleText, callback) {
    var myObject = {
        "filter_title": titleText,
        "per_page": 1,
        "fields": "id,title",
        "filter_status": "watching"
    };

    var url = "https://api.annict.com/v1/me/works?access_token=" + GLOBAL_access_token;

    $.getJSON(
        url,
        $.param(myObject, true),
        function (data, status) {
            if (status == "success") {
                var count = data["works"].length
                if (count > 0) {
                    var id = data["works"][0]["id"];
                    callback(id);
                }
                else {
                    showMessage("`" + titleText + "` did not exist.")
                }
            }
            else {
                showMessage("Get Work data error.")
            }
        }
    );
}

function getEpisodeId(episodeText, workId, callback) {

    var myObject = {
        "filter_work_id": workId,
        "sort_id": "asc"
    };

    var url = "https://api.annict.com/v1/episodes?access_token=" +GLOBAL_access_token;

    $.getJSON(
        url,
        $.param(myObject, true),
        function (data, status) {
            if (status == "success") {
                var episodes = data["episodes"]
                var isCall = false
                for (var i = 0; i < episodes.length; i++) {
                    var episode = episodes[i]
                    if (episode["title"] == episodeText) {
                        callback(episode["id"])
                        isCall = true
                        break
                    }
                }

                if (isCall == false) {
                    showMessage("`" + episodeText + "` did not exist.")
                }
            }
            else {
                showMessage("Get episode data error.")
            }
        }
    );
}


