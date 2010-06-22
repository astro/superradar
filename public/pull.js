function pull(serial) {
  console.log("pull("+serial+")");
  $.ajax({ url: '/updates/' + serial,
	   success: function(content) {
	     var entries = JSON.parse(content);
	     console.log(entries.length + " entries pulled");
	     $.map(entries,
		   function(entry) {
		     if (entry.serial > serial)
		       serial = entry.serial;

		     var p = $('<p/>');
		     p.text(entry.title);
		     p.hide();
		     p.insertAfter('h1');
		     p.slideDown(100);
		   });
	     pull(serial);
	   }
	 });
}

$(document).ready(function() {
		    pull(-1);
		  });