
// メッセージ用のボックスをInjectする
const s = document.createElement('script');
s.src = chrome.extension.getURL('js/iziToast.min.js');
s.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(s);

var link = document.createElement("link");
link.href = chrome.extension.getURL("styles/iziToast.min.css");
link.type = "text/css";
link.rel = "stylesheet";
(document.head || document.documentElement).appendChild(link);

window.onload=function () {
    $("#shawOAuth").on( "click",function () {
        window.open("https://kakunpc.com/danime/openAnnict.php", '', 'location=no, width=640, height=480');
    });

    $("#save").on("click", function () {
        const token = $("#message").val();
        chrome.storage.sync.set({ token: token });
            iziToast.show({
                title: "OK",
                message: "保存しました"
        })
    });

    chrome.storage.sync.get( {token: ""}, items =>
        $("#message").val(items.token)
    );
};
