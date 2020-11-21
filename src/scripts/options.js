
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
    const inputKeys=["token","sendingTime" ,"postUrl"];
    const inputObj=inputKeys.reduce((obj, cur)=>Object.assign(obj, {[cur]:""}), {});
    chrome.storage.sync.get( inputObj, items =>
        inputKeys.forEach(key => $(`#input_${key}`).val(items[key]))
    );
    const checkKeys =  {"webhookNoMatched":"", "webhookNoWorkId":"", "webhookSuccess":""};
    chrome.storage.sync.get( checkKeys, items =>{
        Object.keys(checkKeys).filter(key=>items[key])
        .forEach(key=> $(`#check_${key}`).find("input")[0].checked=!!(items[key]) )}
    );

    $(".saveButton").on("click", function () {
        const inputKey=$(this)[0].id.match(/(?<=btn_)\S+/)[0];
        const inputContent = $(`#input_${inputKey}`).val();
        chrome.storage.sync.set({ [inputKey]: inputContent });
            iziToast.show({
                title: "OK",
                message: "保存しました"
        })
    })
    $(".custom-checkbox").on("change", function(){
        const inputKey=$(this)[0].id.match(/(?<=check_)\S+/)[0];
        chrome.storage.sync.set({ [inputKey]: $($(this)[0]).find("input")[0].checked });
    })
};
