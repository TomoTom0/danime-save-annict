

url=`https://api.annict.com/db/works/5941/programs`
res=await fetch(url).then(d=>d.json())

title="カードファイト!! ヴァンガードG"
annictToken="NaurnElnjgRlCb804bnm9LxkxdH2rlkHX1u-MYFsNV0"
query = `
{ searchWorks(
        titles:"${title}",
        orderBy: { field: WATCHERS_COUNT, direction: DESC },
    ) {
        edges {
            node {
                title
                annictId
                media
                programs {
                    edges {
                        node {
                            channel {
                                name
                                annictId
                            }
                            scPid
                            annictId
                        }
                    }
                }
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
graphql_url = `https://api.annict.com/graphql?query=${query}`;
//console.log(graphql_url)
headers = {
    'Authorization': `Bearer ${annictToken}`
};
res= await fetch(graphql_url, { method: "POST", headers: headers })
    .then(res => res.json())
    .then(jsoned => jsoned.errors ? jsoned : jsoned.data.searchWorks.edges.map(d => d.node));


const obtainStreamBody = async (url) => {
    for (const count of Array(3)) {
        try {
            const content = await fetch(url).then(d => d.body)
                .then(d => d.getReader())
                .then(reader => reader.read())
                .then(res => new TextDecoder("utf-8").decode(res.value));
            return content;
        } catch { continue; }
    }
    return "";
}
comp_url="https://anime.dmkt-sp.jp/animestore/mpa_cmp_pc"

async function expandPage(btnClass = "All") {
    const beforeExpandArea = $("div.pageWrapper div.itemWrapper.clearfix .itemForExpand");
    if (beforeExpandArea.length > 0) beforeExpandArea.remove();
    const expandMode = ["All", "Five", "Reverse"].filter(d => btnClass.indexOf(d) != -1)[0];
    $(`.btnExpandPage`).css({ color: "" });
    if (!expandMode || expandMode == "Reverse") {
        const itemCount = $("div.itemWrapper.clearfix .itemModule.list").length;
        $("div.pageWrapper div.mypageHeader div.btnSelectToggle.formContainer label span.count").text(itemCount);
        await setSyncStorage({ expandMode: "" });
        return;
    }

    const ul = $("div.pageWrapper ul.onlyPcLayout");
    const pageCurrent = $("li.current", ul).text().match(/\d+/) - 0;
    const pageLength = $("li:last", ul).text().match(/\d+/) - 0;
    const urlTmp = location.href.replace(/(?<=\?.*)selectPage=\d+/, "");
    const sepTmp = [[/[\?&]$/, ""], [/\?/, "&"], [/.*/, "?"]].filter(d => d[0].test(urlTmp)).map(d => d[1])[0];
    const urlBase = urlTmp + sepTmp + "selectPage=";
    const obtainRange = {
        All: { length: pageLength - 1, first: 2 },
        Five: { length: Math.min(4, pageLength - pageCurrent), first: pageCurrent + 1 }
    }
    const pageRange = obtainRange[expandMode];
    if (!pageRange) return;

    $(`.btnExpandPage.${expandMode}`).css({ color: "orange" });
    const divForExpand = $("<div>", { class: `itemForExpand ${expandMode}` });
    $("div.pageWrapper div.itemWrapper.clearfix").append(divForExpand);

    for (const pageNum of [...Array(pageRange.length).keys()].map(d => d + pageRange.first)) {
        const content = await obtainStreamBody(`${urlBase}${pageNum}`);
        const workIdsTmp = $("div.itemWrapper.clearfix .itemModule.list", content).map((ind, obj) => $(obj).data("workid"));
        const workIds = (workIdsTmp.length > 0) ? workIdsTmp.toArray().map(d => d.toString()) :
            $("div.itemWrapper.clearfix .itemModule.list>input", content).map((ind, obj) => $(obj).val()).toArray();
        const BGColors = await obtainWorkBGColors(workIds);
        const itemHTML = $("div.itemWrapper.clearfix .itemModule.list", content).map((ind, obj) => {
            const BGColor = !$(obj).is(".watched") ? BGColors[ind] : BGColors[ind].replace("white", "rgba(242,242,242,.8)");
            return $(obj).css({ background: BGColor }).prop("outerHTML");
        }).toArray().join("\n");
        $("div.itemForExpand").append(itemHTML);
    };
    const itemCount = $("div.itemWrapper.clearfix .itemModule.list").length;
    $("div.pageWrapper div.mypageHeader div.btnSelectToggle.formContainer label span.count").text(itemCount);
    await setSyncStorage({ expandMode: expandMode });
}





obtainWorksWithUser = async (pageNum=1)=> {
    annictToken="NaurnElnjgRlCb804bnm9LxkxdH2rlkHX1u-MYFsNV0"
    headers = {
        "Authorization": `Bearer ${annictToken}`
    };
    params={filter_status:"watched", page:pageNum, per_page:50, sort_season:"asc"};
    url = `https://api.annict.com//v1/me/works?${Object.entries(params).map(d=>`${d[0]}=${d[1]}`).join("&")}`;
    res = await fetch(url, { method: "GET", headers: headers })
        .then(d => d.json());
    return res;
};

resFirst=await obtainWorksWithUser(1);
pageTotal=Math.ceil(resFirst.total_count/50);
watchedWorks=resFirst.works;
for (pageNum=2;pageNum<=pageTotal;pageNum++){
    console.log(pageNum)
    resTmp=await obtainWorksWithUser(pageNum);
    watchedWorks=watchedWorks.concat(resTmp.works);
}

