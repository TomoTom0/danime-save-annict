

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

