function padLeft(len, padding, s) {
  s = s.toString();
  while(s.length < len) {
    s = padding + s;
  }
  return s;
}
Date.prototype.toISO8601 = function() {
sys.puts("toISO8601 of "+this);
  var tz = this.getTimezoneOffset();
  return this.getFullYear() + '-' +
    padLeft(2, '0', this.getMonth() + 1) + '-' +
    padLeft(2, '0', this.getDate()) + 'T' +
    padLeft(2, '0', this.getHours()) + ':' +
    padLeft(2, '0', this.getMinutes()) + ':' +
    padLeft(2, '0', this.getSeconds()) +
    (tz >= 0 ? '-' : '+') +
    padLeft(2, '0', Math.abs(tz) / 60) + ':' +
    padLeft(2, '0', Math.abs(tz) % 60);
};


/*** Helpers for ATOM to JSON conversion */
function xmlToAttr(el, name, json) {
    var text = el.getChildText(name);
    if (text)
	json[name] = text;
}
function xmlAttrToAttr(el, name, json) {
    var text = el.attrs[name];
    if (text)
	json[name] = text;
}
function xmlToLink(linkEl) {
    var json = {};
    xmlAttrToAttr(linkEl, "rel", json);
    xmlAttrToAttr(linkEl, "href", json);
    xmlAttrToAttr(linkEl, "type", json);
    xmlAttrToAttr(linkEl, "title", json);
    return json;
}
function xmlToAuthor(authorEl) {
    var json = {};
    xmlToAttr(authorEl, "name", json);
    xmlToAttr(authorEl, "uri", json);
    xmlToAttr(authorEl, "email", json);
    return json;
}

function onSuperfeedrStanza(stanza) {
  if (stanza.is('message')) {
    var feedTitle = null;
    var entries = [];
    stanza.getChildren("event").forEach(function(eventEl) {
      eventEl.getChildren("status").forEach(function(statusEl) {
        feedTitle = statusEl.getChildText("title");
	if (feedTitle && feedTitle.toString().length == 0)
	  feedTitle = null;
      });

      eventEl.getChildren("items").forEach(function(itemsEl) {
	var node = itemsEl.attrs.node;
	if (node) {
	  itemsEl.getChildren("item").forEach(function(itemEl) {
	    itemEl.getChildren("entry").forEach(function(entryEl) {
	      var json = { rss: node };
	      if (feedTitle)
		json.feedTitle = feedTitle;
	      xmlToAttr(entryEl, "id", json);
	      xmlToAttr(entryEl, "title", json);
	      xmlToAttr(entryEl, "published", json);
	      xmlToAttr(entryEl, "content", json);
	      xmlToAttr(entryEl, "summary", json);
	      json['links'] = entryEl.getChildren("link").map(xmlToLink);
	      json['authors'] = entryEl.getChildren("author").map(xmlToAuthor);

	      entries.push(json);
	    });
	  });
	}
      });
    });
    onEntries(entries);
  } else if (stanza.is('iq')) {
    var id = stanza.attrs['id'];
    var type = stanza.attrs['type'];
    if (xmppReqs[id]) {
      if (type == 'error')
	sys.puts("Reply: " + stanza.toString());
      xmppReqs[id](type == 'result');
      delete xmppReqs[id];
    }
  }
}
