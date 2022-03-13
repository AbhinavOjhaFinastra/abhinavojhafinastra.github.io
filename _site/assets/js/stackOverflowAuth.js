// This file is provided to API clients to automate various tasks, initially focused on login.
// If you break the interface, I will *find* you.

// Note that there can't be *any* dependencies in this file, no jQuery, no UI, no SE-specific stuff, **nothing**

window.FSE =
function (constUndefined) {
    "use strict";

    var clientId,
        loginUrl,
        proxyUrl,
        requestKey,
        userAgent = window.navigator.userAgent,
        document = window.document,
        encodeURIComponent = window.encodeURIComponent,
        nextState = 1,
        windowName = "sew" + nextState++,
        appDomain,
        appBase,
        seUrl = 'https://finastra.stackenterprise.co',
        fetchUserUrl = 'https://finastra.stackenterprise.co/2.0/me/associated',
        optionsRequired = 'must pass an object';

    function requireOption(options, key) {
        var ret = options[key];
        if (!ret) {
            throw key + ' required';
        }

        return ret;
    }

    // Options are:
    //   - clientId: for app registration
    //   - channelUrl: a blank page for cross-domain communication in the absence of postMessage
    //   - complete: a function() that is called after initialization is complete
    //   - key: request key
    //   - dev: internal only, if set we hit the dev tier
    function init(options) {
        if (!options) { throw optionsRequired; }

        var cid = requireOption(options, 'clientId'),
            proxy = requireOption(options, 'channelUrl'),
            complete = requireOption(options, 'complete'),
            protocol = window.location.protocol,
            proto = protocol.substring(0, protocol.length - 1),
            domain = (protocol + '//' + window.location.host).toLowerCase();

        let error = options.error;

        requestKey = requireOption(options, 'key');
        appDomain = requireOption(options, 'appDomain');
        appBase = requireOption(options, 'appBase');

        clientId = cid;

        proxyUrl = proxy;

        // proxyUrl must be under the currently hosting domain
        if (proxyUrl.toLowerCase().indexOf(domain) !== 0) {
            error && error({ errorName: 'Invalid Channel Url', errorMessage: 'channelUrl must be under the current domain' });
        }


        loginUrl = seUrl + '/oauth/dialog?redirect_uri=' + encodeURIComponent(appDomain + '/' + appBase + '/login_success?assisted=' + cid + '&protocol=' + proto + '&proxy=' + encodeURIComponent(proxyUrl));

        // This is effectively a place holder, in case we need any longer running initialization in the future
        //   putting it on a timeout so nobody assumes it maintains any magic state w.r.t. clicking or loading
        setTimeout(function () { complete({ version: '40751' }); });
    }

    function fetchUsers(token, expires, success, error) {
        var script,
            callbackName = 'sec' + nextState++,
            src = fetchUserUrl,
            callbackFunction =
                function (data) {
                    // cleanup our callback, but IE doesn't appreciate deleting properties from window
                    //   so just "undefined" it out; here's to hoping GC picks it up
                    window[callbackName] = constUndefined;

                    script.parentNode.removeChild(script);

                    if (data.error_id) {
                        error({ errorName: data.error_name, errorMessage: data.error_message });
                        return;
                    }

                    success({ accessToken: token, expirationDate: expires, networkUsers: data.items });
                };

        // Make sure we don't conflict with another registered callback function
        while (window[callbackName] || document.getElementById(callbackName)) {
            callbackName = 'sec' + nextState++;
        }

        window[callbackName] = callbackFunction;

        src +=
            '?pagesize=100&access_token=' +
            encodeURIComponent(token) +
            '&key=' +
            encodeURIComponent(requestKey) +
            '&callback=' +
            encodeURIComponent(callbackName);

        script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = src;
        script.id = callbackName;

        document.getElementsByTagName('head')[0].appendChild(script);
    }

    // Options contains
    //   success: function(data)
    //     - data will have
    //       * accessToken
    //       * expirationDate
    //       * networkUsers
    //   error: function(data)
    //     - data will have
    //       * errorName
    //       * errorMessage
    //   scope: an array of scopes to request
    //   networkUsers: bool, if true returns associated users in success
    function authenticate(options) {
        if (!options) { throw optionsRequired; }

        var detachListener,
            poll,
            opened,
            handler,
            pollHandle,
            success = requireOption(options, 'success'),
            scopeOpt = options.scope,
            scope = '',
            state = nextState++,
            url = loginUrl + '&client_id=' + clientId + '&state=' + state,
            error = options.error;

        if (scopeOpt && Object.prototype.toString.call(scopeOpt) !== '[object Array]') { throw 'scope must be an Array'; }

        if (scopeOpt) { scope = scopeOpt.join(' '); }

        if (scope.length > 0) { url += '&scope=' + encodeURIComponent(scope); }

        handler =
            function (e) {
                // came from the site we expected and the *window* we opened
//                if (e.origin !== seUrl || e.source !== opened) { return; }

                if (e.origin !== appDomain) { return; }

                var expires,
                    token,
                    i,
                    pieces,
                    parts = e.data.substring(1).split('&'),
                    map = {};

                for (i = 0; i < parts.length; i++) {
                    pieces = parts[i].split('=');
                    map[pieces[0]] = pieces[1];
                }

                // came with the state we generated
                if (+map.state !== state) {
                    return;
                }

                if (detachListener) {
                    // Kill the event listener, leaving things tidy since we're a library
                    window.removeEventListener("message", handler);
                }

                opened.close();

                token = map.access_token;
                if (token) {
                    expires = map.expires;
                    if (expires) {
                        expires = new Date(new Date().getTime() + expires * 1E3);
                    }

                    if (options.networkUsers) {
                        fetchUsers(token, expires, success, error);
                    } else {
                        success({ accessToken: token, expirationDate: expires, requestKey: requestKey });
                    }

                    return;
                }

                // error is optional
                error && error({ errorName: map.error, errorMessage: map.error_description });
            };

        // dirty IE check
        if (window.postMessage && window.addEventListener && !((/MSIE (\d+\.\d+)/.exec(userAgent) || [])[1] <= 9.0)) {
            detachListener = true;
            window.addEventListener("message", handler);
        } else {
            poll =
                function () {
                    if (!opened) { return; }

                    if (opened.closed) {
                        // polling is pointless now
                        clearInterval(pollHandle);
                        return;
                    }

                    let msgFrame = opened.frames['se-api-frame'];
                    if (msgFrame) {
                        // cleanup
                        clearInterval(pollHandle);

                        handler({ origin: seUrl, source: opened, data: msgFrame.location.hash });
                    }
                };

            pollHandle = setInterval(poll, 50);
        }

        var testAccessHandler = function () {
            if (opened && opened.closed) {
                // polling is pointless now
                window.removeEventListener("mouseover", testAccessHandler);
                return;
            }

            if (opened) {
                try {
                    let msgFrame = opened.frames['se-api-frame'];
                } catch {
                    window.removeEventListener("message", handler);

                    if (opened) {
                        opened.close();
                        clearInterval(pollHandle);
                    }

                    error && error({ errorName: "WrongClientID", errorMessage: "Please enter the correct client ID" });
                } finally {
                    window.removeEventListener("mouseover", testAccessHandler);
                }
            }
        };

        // This event will check if the window opened for auth is accessible, since using wrong client id will mean opened window frame will not be accessible due
        // to cross origin policy. Had to use mouse over for the parent window because in such case opened window has the access and so the rest of code doesn't
        // get triggered as the parent window loses focus to the child window, and even after manually closing it, rest of the code is not gonna get triggered
        window.addEventListener("mouseover", testAccessHandler);

        opened = window.open(url, windowName, "width=660,height=480");
    }

    return {
        authenticate: authenticate,
        init: init
    };
} ();