
const webhookDefaultSetting = {
    postUrl: "", webhookNoMatched: true,
    webhookNoWorkId: false, webhookSuccess: false, annictSend: true, webhookContentChanged: false, webhookContent: {}
};
const webhookDefaultString = [webhookDefaultSetting];

const webhookKeys = {
    check: ["webhookNoMatched", "webhookNoWorkId", "webhookSuccess", "webhookContentChanged"],
    input: ["postUrl"]
};

const otherKeys = {
    input: { token: "", sendingTime: 300 },
    check: { annictSend: true }
}

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

let webhookNumber = 1;
chrome.storage.sync.get({ webhookSettings: webhookDefaultString }, items => {
    webhookNumber = webhookSettings = items.webhookSettings.length;
});

$(function () {
    //------ not webhook ---------
    // set value
    chrome.storage.sync.get(otherKeys.input, items =>
        Object.entries(items).forEach(kv => $(`#input_${kv[0]}`).val(kv[1]))
    );
    chrome.storage.sync.get(otherKeys.check, items => {
        Object.entries(items).forEach(kv => $(`#check_${kv[0]}`).find("input")[0].checked = kv[1])
    });
    //-------------- webhook ---------------
    // set value
    chrome.storage.sync.get({ webhookSettings: webhookDefaultString }, items => {
        const webhookSettings = items.webhookSettings;
        Object.keys(webhookSettings).forEach(webhookNum => {
            if (webhookNum > 0) addWebhookBlock(webhookNum);
            const webhook_now = $(`#webhook_${webhookNum}`);
            const webhookArea = $(".webhookContent", webhook_now);
            for (const key of webhookKeys.check) {
                const val = webhookSettings[webhookNum][key];
                if (val == "") continue;
                $(`.check_${key}`, webhook_now).prop("checked", val);
            }
            for (const key of webhookKeys.input) {
                const val = webhookSettings[webhookNum][key];
                $(`.input_${key}`, webhook_now).val(val);
            }
            const webhookContent = webhookSettings[webhookNum].webhookContent;
            console.log(webhookContent)
            Object.entries(webhookContent).forEach((kv, ind) => {
                console.log(kv, ind)
                if (ind > 0) {
                    const keyButtonNumber = ind;
                    const div_webhook = $("<div>", { class: `div_webhook_${keyButtonNumber}` });
                    const inputKey = $("<input>", { type: "text", class: "webhookKey form-control", placeholder: "key", style: "width: 15%; display: inline;" });
                    const inputValue = $("<input>", { type: "text", class: "webhookValue form-control", placeholder: "value", style: "width: 60%; display: inline;" });
                    const deleteButton = $("<button>", { class: `btn_webhookContentDelete_${keyButtonNumber} deleteButton btn btn-primary`, type: "button" }).append("削除");
                    inputKey.val(kv[0]);
                    inputValue.val(kv[1]);
                    div_webhook.append(inputKey).append(inputValue).append(deleteButton);
                    webhookArea.append(div_webhook);
                } else {
                    const div_webhook = $(".div_webhook_0", webhookArea);
                    const inputKey = $(".webhookKey", div_webhook);
                    const inputValue = $(".webhookValue", div_webhook);
                    console.log(div_webhook, inputKey, inputValue)
                    inputKey.val(kv[0]);
                    inputValue.val(kv[1]);
                }
            })
        })
    })

})

document.addEventListener("click", function (e) {
    const webhook_now = $(e.target).parents("[id^=webhook_]");
    const clicked_class = $(e.target).attr("class");
    if (!clicked_class) return;
    //----------- not webhook ------------
    //get value
    if (webhook_now.length == 0){
        if (clicked_class.indexOf("saveButton") != -1) {
            const inputKey = $(e.target).attr("id").match(/(?<=btn_)\S+/)[0];
            const inputContent = $(`#input_${inputKey}`).val();
            chrome.storage.sync.set({ [inputKey]: inputContent });
            iziToast.show({ title: "OK", message: "保存しました" });
        }
        else if (clicked_class.indexOf("custom-checkbox") != -1) {
            const inputKey = $(e.target).attr("id").match(/(?<=check_)\S+/)[0];
            chrome.storage.sync.set({ [inputKey]: $($(this)[0]).find("input")[0].checked });
        }
    } //----------- webhook ------------
    else {
        const webhookNum = webhook_now.attr("id").match(/(?<=webhook_)\d+/)[0];
        const webhookArea = $(".webhookContent", webhook_now);
        // add or delete webhook content
        if (clicked_class.indexOf("deleteButton") != -1) {
            const keyButtonNumber = clicked_class.match(/(?<=btn_webhookContentDelete_)\d+/)[0];
            const div_deleted = $(`.div_webhook_${keyButtonNumber}`, webhookArea);
            div_deleted.remove();
        }
        else if (clicked_class.indexOf("btn_webhookContentAdd") != -1) {
            const oldKey = $(".webhookKey:last", webhookArea);
            if (oldKey.val() == "") return;
            const keyButtonNumber = $(".webhookKey", webhookArea).length;
            const div_webhook = $("<div>", { class: `div_webhook_${keyButtonNumber}` });
            const inputKey = $("<input>", { type: "text", class: "webhookKey form-control", placeholder: "key", style: "width: 15%; display: inline;" });
            const inputValue = $("<input>", { type: "text", class: "webhookValue form-control", placeholder: "value", style: "width: 60%; display: inline;" });
            const deleteButton = $("<button>", { class: `btn_webhookContentDelete_${keyButtonNumber} deleteButton btn btn-primary`, type: "button" }).append("削除");
            div_webhook.append(inputKey).append(inputValue).append(deleteButton);
            webhookArea.append(div_webhook);
        }    // get value
        else if (clicked_class.indexOf("btn_webhookSave") != -1) {
            const Keys = $(".webhookKey", webhookArea).map((ind, el) => $(el).val()).toArray();
            const Values = $(".webhookValue", webhookArea).map((ind, el) => $(el).val()).toArray();
            const webhookContent = [...Array(Keys.length).keys()].reduce((obj, ind) => Object.assign(obj, { [Keys[ind]]: Values[ind] }), {});
            const inputObjs = webhookKeys.input.reduce((obj, acc) => Object.assign(obj, { [acc]: $(`.input_${acc}`, webhook_now).val() }), {});
            chrome.storage.sync.get({ webhookSettings: webhookDefaultString }, items => {
                let webhookSettings = items.webhookSettings;
                webhookSettings[webhookNum].webhookContent = webhookContent;
                Object.entries(inputObjs).forEach(kv => webhookSettings[webhookNum][kv[0]] = kv[1]);
                chrome.storage.sync.set({ webhookSettings: webhookSettings });
            });
            iziToast.show({ title: "OK", message: "保存しました" });
        }
        else if (clicked_class.indexOf("custom-control-webhook-input") != -1) {
            const checkKey = clicked_class.match(/(?<=check_)webhook\S+/)[0];
            const checkVal = $(e.target).prop("checked");
            chrome.storage.sync.get({ webhookSettings: webhookDefaultString }, items => {
                let webhookSettings = items.webhookSettings;
                webhookSettings[webhookNum][checkKey] = checkVal;
                chrome.storage.sync.set({ webhookSettings: webhookSettings });
            });
        } // add or delete block
        else if (clicked_class.indexOf("btn_webhookBlockAdd") != -1) {
            chrome.storage.sync.get({ webhookSettings: webhookDefaultString }, items => {
                let webhookSettings = items.webhookSettings;
                webhookSettings.push(webhookDefaultSetting);
                chrome.storage.sync.set({ webhookSettings: webhookSettings });
            })
            addWebhookBlock(webhookNumber);
            webhookNumber += 1;
        } else if (clicked_class.indexOf("btn_webhookBlockDelete") != -1) {
            const webhook_now = $(e.target).parents("[id^=webhook_]");
            if (webhook_now.length != 0) return;
            const webhookNum = $(e.target).attr("id").match(/(?<=btn_webhookBlockDelete_)\d+/)[0];
            const deleted_block = $(`#webhook_${webhookNum}`);
            deleted_block.remove();
            $(e.target).remove();
            chrome.storage.sync.get({ webhookSettings: webhookDefaultString }, items => {
                let webhookSettings = items.webhookSettings;
                webhookSettings.splice(webhookNum, 1);
                chrome.storage.sync.set({ webhookSettings: webhookSettings });
            });
            webhookNumber -= 1;
        }
    }
});

function addWebhookBlock(webhookNum) {
    if ($(`#webhook_${webhookNum}`).length > 0) return;
    const deleteButton = $("<button>", { type: "button", class: "btn_webhookBlockDelete btn btn-primary", id: `btn_webhookBlockDelete_${webhookNum}` }).append("Webhook設定を削除")
    const webhook_blockHtml = `<div class="well bs-component" id="webhook_${webhookNum}">
    <form class="form-horizontal">
        <div class="form-group">
            <label class="col-lg-2 control-label">Webhook Post URL</label>
            <div class="col-lg-10">
                <input type="text" class="form-control input_postUrl" placeholder="">
            </div>
        </div>

        <div class="form-group">
            <div class="custom-control custom-checkbox">
                <input type="checkbox" class="custom-control-webhook-input check_webhookNoMatched" checked>
                <label class="custom-control-label">作品/エピソードが見つからなかった時</label>
            </div>
            <div class="custom-control custom-webhook-checkbox">
                <input type="checkbox" class="custom-control-webhook-input check_webhookNoWorkId">
                <label class="custom-control-label">Annict DBにdアニメストアのWork IDが登録されていなかった時</label>
            </div>
            <div class="custom-control custom-webhook-checkbox">
                <input type="checkbox" class="custom-control-webhook-input check_webhookSuccess">
                <label class="custom-control-label">エラーが起きなかった時 (上記以外の場合)</label>
            </div>
        </div>
        <div class="form-group">
            <div class="col-lg-10 col-lg-offset-2">
                <button type="button" class="btn_postUrl btn_webhookSave btn btn-primary">保存</button>
            </div>
        </div>
    </form>
    <hr>
    <h3>Webhookの送信内容</h3>
    <form class="form-horizontal">
        <div class="form-group">
            <div class="custom-control custom-webhook-checkbox">
                <input type="checkbox" class="custom-control-webhook-input check_webhookContentChanged">
                <label class="custom-control-label">送信する内容をデフォルトから変更する</label>
            </div>
        </div>
        valueの中で変数を使用できます。(例: <code>I've seen {workTitle}-{episodeNumber}.</code>)
        <div class="form-group">
            <div class="col-lg-10 webhookContent">
                <div class="div_webhook_0">
                    <input type="text" class="webhookKey form-control" placeholder="key" style="width: 15%; display: inline;">
                    <input type="text" class="webhookValue form-control" placeholder="value" style="width: 60%; display: inline;">
                </div>
            </div>
        </div>

        <div class="form-group">
            <div class="col-lg-10 col-lg-offset-2">
                <button type="button" class="btn_webhookContentAdd btn btn-primary">追加</button>
                <button type="button" class="btn_webhookSave btn btn-primary">保存</button>
            </div>
        </div>
    </form>
</div>`

    const optionMenu = $("#extraWebhook");
    optionMenu.append(deleteButton).append($(webhook_blockHtml));
}
