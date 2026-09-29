(function(){
  'use strict';
  /* Cosmetic/ergonomic layer only. No business data is altered here. */
  document.documentElement.classList.add('ir-premium-ui');
  document.querySelectorAll('.workspace-widget').forEach(function(widget){
    var rows=widget.querySelectorAll('.widget-row,.dashboard-animal-card,.widget-cycle-card');
    if(rows.length===0) widget.classList.add('is-empty-widget');
  });
  /* Horizontal action strips should start at the first item after navigation/back. */
  document.querySelectorAll('.dashboard-fast-actions,.animal-fast-actions,.planner-quick-entry').forEach(function(strip){
    strip.addEventListener('wheel',function(e){
      if(Math.abs(e.deltaY)>Math.abs(e.deltaX) && strip.scrollWidth>strip.clientWidth){strip.scrollLeft+=e.deltaY;e.preventDefault();}
    },{passive:false});
  });
})();
