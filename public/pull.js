function pull(serial) {
  console.log("pull("+serial+")");
  $.ajax({ url: '/updates/' + serial,
	   success: function(content) {
	     var entries = JSON.parse(content);
	     console.log(entries.length + " entries pulled");
	     /* Add each entry */
	     $.map(entries,
		   function(entry) {
		     if (entry.serial > serial)
		       serial = entry.serial;

		     var p = $('<p/>');
		     p.data('rss', entry.rss);
		     p.data('id', entry.id);
		     p.data('published', new Date(entry.published));
		     console.log(entry.published+" -> "+new Date(entry.published));
		     p.data('serial', entry.serial);
		     p.text(entry.published+' — '+entry.title);
		     p.hide();
		     var preceding = 'h1';
		     var ps = $('p').toArray();
		     for(var ps1 in ps) {
		       var published = ps[ps1].data && ps[ps1].data('published');
		       if (published) {
			 console.log(published.getTime()+' < '+p.data('published').getTime());
			 if (published.getTime() < p.data('published').getTime())
			   preceding = ps[ps1];
			 else
			   break;
		       } else {
			 // FIX:
			 console.log('p w/o data');
		       }
		     }
		     p.insertAfter(preceding);
		     p.slideDown(500);
		   });

	     /* Drop old */
	     $('p').each(function() {
			   var p = $(this);
			   var pSerial = p.data('serial');
			   if (pSerial && pSerial < serial - 100)
			     p.remove();
			 });

	     /* Get next */
	     pull(serial);
	   }
	 });
}

$(document).ready(function() {
		    pull(-1);
		  });