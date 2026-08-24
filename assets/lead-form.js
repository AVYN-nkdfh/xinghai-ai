(function () {
  "use strict";

  var form = document.querySelector("[data-lead-form]");
  if (!form) return;

  var phone = form.elements.phone;
  var consent = form.elements.consent;
  var internationalTransferConsent = form.elements.internationalTransferConsent;
  var startedAt = form.elements.startedAt;
  var turnstileToken = form.elements.turnstileToken;
  var submit = form.querySelector("button[type='submit']");
  var status = form.querySelector("[data-lead-status]");
  var widgetHost = form.querySelector("[data-turnstile-widget]");
  var serviceConsentDialog = document.querySelector("[data-service-consent-dialog]");
  var serviceConsentConfirm = document.querySelector("[data-service-consent-confirm]");
  var serviceConsentCancel = document.querySelectorAll("[data-service-consent-cancel]");
  var siteKeyMeta = document.querySelector("meta[name='tudu-turnstile-site-key']");
  var actionMeta = document.querySelector("meta[name='tudu-turnstile-action']");
  var siteKey = String(siteKeyMeta ? siteKeyMeta.content : "").trim();
  var turnstileAction = String(actionMeta ? actionMeta.content : "").trim();
  var localPreview = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(window.location.hostname);
  var phonePattern = /^1[3-9]\d{9}$/;
  var busy = false;
  var widgetId = null;
  var challengeScriptRequested = false;
  var challengeRequired = !localPreview;
  var pendingSubmitAfterConsent = false;

  function resetStartedAt() {
    startedAt.value = String(Date.now());
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.classList.toggle("is-error", kind === "error");
    status.classList.toggle("is-success", kind === "success");
  }

  function hasServiceConsent() {
    return internationalTransferConsent.value === "true";
  }

  function setServiceConsent(granted) {
    internationalTransferConsent.value = granted ? "true" : "false";
  }

  function openServiceConsent() {
    if (!serviceConsentDialog) return;
    if (typeof serviceConsentDialog.showModal === "function") serviceConsentDialog.showModal();
    else serviceConsentDialog.setAttribute("open", "");
    if (serviceConsentConfirm) window.requestAnimationFrame(function () { serviceConsentConfirm.focus(); });
  }

  function closeServiceConsent() {
    if (!serviceConsentDialog) return;
    if (typeof serviceConsentDialog.close === "function" && serviceConsentDialog.open) serviceConsentDialog.close();
    else serviceConsentDialog.removeAttribute("open");
  }

  function syncSubmit() {
    var waitingForChallenge = challengeRequired && hasServiceConsent() && !turnstileToken.value;
    submit.disabled = busy || !consent.checked || waitingForChallenge;
    submit.textContent = busy ? "正在安全提交…" : (waitingForChallenge ? "请完成安全验证" : "请老师联系我");
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    syncSubmit();
  }

  function clearChallenge(message) {
    turnstileToken.value = "";
    if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
    if (message) setStatus(message, "error");
    syncSubmit();
  }

  function removeChallengeWidget() {
    turnstileToken.value = "";
    if (widgetId !== null && window.turnstile) {
      window.turnstile.remove(widgetId);
    }
    widgetId = null;
    if (widgetHost) widgetHost.replaceChildren();
    syncSubmit();
  }

  function ensureTurnstileLoaded() {
    if (localPreview || !consent.checked || !hasServiceConsent()) return;
    if (!siteKey || !turnstileAction || !widgetHost) {
      setStatus("安全验证尚未配置，请使用微信咨询。", "error");
      syncSubmit();
      return;
    }
    if (window.turnstile) {
      window.onTuduTurnstileLoad();
      return;
    }
    if (challengeScriptRequested) return;

    challengeScriptRequested = true;
    var challengeScript = document.createElement("script");
    challengeScript.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTuduTurnstileLoad&render=explicit";
    challengeScript.async = true;
    challengeScript.defer = true;
    challengeScript.onerror = function () {
      challengeScriptRequested = false;
      challengeScript.remove();
      window.onTuduTurnstileError();
    };
    document.head.appendChild(challengeScript);
  }

  function normalizedPhone() {
    return String(phone.value || "").replace(/\D/g, "").slice(0, 11);
  }

  phone.addEventListener("input", function () {
    var normalized = normalizedPhone();
    if (phone.value !== normalized) phone.value = normalized;
    phone.removeAttribute("aria-invalid");
    if (status.classList.contains("is-error")) setStatus("", "");
  });

  consent.addEventListener("change", function () {
    if (status.classList.contains("is-error")) setStatus("", "");
    if (!consent.checked) {
      pendingSubmitAfterConsent = false;
      setServiceConsent(false);
      closeServiceConsent();
      removeChallengeWidget();
    }
    syncSubmit();
  });

  Array.prototype.forEach.call(serviceConsentCancel, function (button) {
    button.addEventListener("click", function () {
      pendingSubmitAfterConsent = false;
      setServiceConsent(false);
      closeServiceConsent();
      syncSubmit();
      submit.focus();
    });
  });

  if (serviceConsentDialog) {
    serviceConsentDialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      pendingSubmitAfterConsent = false;
      setServiceConsent(false);
      closeServiceConsent();
      syncSubmit();
      submit.focus();
    });
  }

  if (serviceConsentConfirm) {
    serviceConsentConfirm.addEventListener("click", function () {
      setServiceConsent(true);
      closeServiceConsent();
      if (status.classList.contains("is-error")) setStatus("", "");
      if (localPreview) {
        pendingSubmitAfterConsent = false;
        form.requestSubmit();
        return;
      }
      pendingSubmitAfterConsent = true;
      ensureTurnstileLoaded();
      syncSubmit();
    });
  }

  window.onTuduTurnstileVerified = function (token) {
    if (!consent.checked || !hasServiceConsent()) {
      removeChallengeWidget();
      return;
    }
    turnstileToken.value = typeof token === "string" ? token : "";
    if (turnstileToken.value && status.classList.contains("is-error")) setStatus("", "");
    syncSubmit();
    if (turnstileToken.value && pendingSubmitAfterConsent) {
      pendingSubmitAfterConsent = false;
      form.requestSubmit();
    }
  };

  window.onTuduTurnstileExpired = function () {
    pendingSubmitAfterConsent = false;
    clearChallenge("安全验证已过期，请重新完成验证。");
  };

  window.onTuduTurnstileError = function () {
    pendingSubmitAfterConsent = false;
    clearChallenge("安全验证暂时不可用，请稍后重试或使用微信咨询。");
  };

  window.onTuduTurnstileLoad = function () {
    if (!consent.checked || !hasServiceConsent() || widgetId !== null || !siteKey || !turnstileAction || !widgetHost || !window.turnstile) return;
    widgetId = window.turnstile.render(widgetHost, {
      sitekey: siteKey,
      action: turnstileAction,
      theme: "dark",
      size: "compact",
      appearance: "interaction-only",
      "response-field": false,
      callback: window.onTuduTurnstileVerified,
      "expired-callback": window.onTuduTurnstileExpired,
      "timeout-callback": window.onTuduTurnstileExpired,
      "error-callback": window.onTuduTurnstileError
    });
  };

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var value = normalizedPhone();
    phone.value = value;

    if (!phonePattern.test(value)) {
      phone.setAttribute("aria-invalid", "true");
      setStatus("请检查手机号是否为 11 位。", "error");
      phone.focus();
      return;
    }
    if (!consent.checked) {
      setStatus("请先确认只就本次课程咨询联系。", "error");
      consent.focus();
      return;
    }
    if (!hasServiceConsent()) {
      pendingSubmitAfterConsent = true;
      openServiceConsent();
      return;
    }
    if (localPreview) {
      setStatus("这是本地预览，不会保存或发送手机号；正式预览环境接通后再做真实提交验收。", "success");
      return;
    }
    if (!turnstileToken.value) {
      pendingSubmitAfterConsent = true;
      ensureTurnstileLoaded();
      setStatus("请完成安全验证后继续提交。", "");
      syncSubmit();
      return;
    }

    var payload = {
      phone: value,
      preferredTime: form.elements.preferredTime.value,
      consent: true,
      internationalTransferConsent: hasServiceConsent(),
      source: form.elements.source.value,
      privacyVersion: form.elements.privacyVersion.value,
      internationalTransferConsentVersion: form.elements.internationalTransferConsentVersion.value,
      turnstileToken: turnstileToken.value,
      company: form.elements.company.value,
      startedAt: Number(startedAt.value)
    };

    setBusy(true);
    setStatus("", "");
    try {
      var response = await fetch("/api/leads/create", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      });
      var body = await response.json().catch(function () { return {}; });
      if (!response.ok || !body.ok) throw new Error(body.code || "submit_failed");
      form.reset();
      setServiceConsent(false);
      removeChallengeWidget();
      resetStartedAt();
      setStatus("已收到，我们会按你选择的时间联系。", "success");
    } catch (error) {
      var retryLater = error && (error.message === "service_unavailable" || error.message === "verification_unavailable");
      setStatus(retryLater ? "咨询入口正在连接，请稍后再试，或使用旁边的微信入口。" : "暂时没有提交成功，请稍后重试或使用微信咨询。", "error");
    } finally {
      pendingSubmitAfterConsent = false;
      clearChallenge("");
      setBusy(false);
    }
  });

  resetStartedAt();
  syncSubmit();
})();
