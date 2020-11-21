
// メッセージ用のボックスをInjectする
const s = document.createElement('script');
s.src = chrome.extension.getURL('js/iziToast.min.js');
s.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(s);

const link = document.createElement("link");
link.href = chrome.extension.getURL("styles/iziToast.min.css");
link.type = "text/css";
link.rel = "stylesheet";
(document.head || document.documentElement).appendChild(link);

window.onload=function () {
    const input_keys=["token", "postUrl"];
    input_keys.forEach(key=>
        chrome.storage.sync.get( {[key]: ""}, items =>{
                $(`#input_${key}`).val(items[key]);
            }
        )
    )

    $(".saveButton").on("click", function () {
        const inputKey=$(this)[0].id.match(/(?<=btn_)\S+/)[0];
        const inputContent = $(`#input_${inputKey}`).val();
        chrome.storage.sync.set({ [inputKey]: inputContent });
            iziToast.show({
                title: "OK",
                message: "保存しました"
        })
    })
};
