module.exports = {
    subscribe: function(url, hub, secret, token, cb) {
	var form = { 'hub.callback': hub,
		     'hub.mode': 'subscribe',
		     'hub.topic': url,
		     'hub.verify': 'sync',
		     'hub.secret': secret,
		     'hub.verify_token': token
		   };
    }
};
