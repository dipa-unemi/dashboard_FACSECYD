// Navegación entre las vistas de nivel superior del dashboard.
// Aislado de app.js a propósito: cada vista aparte de "Perfil Estudiantil"
// es un dashboard independiente (su propio archivo .html con su propio
// CSS/JS) cargado dentro de un iframe para evitar cualquier choque de
// estilos o nombres globales con el dashboard de Perfil Estudiantil ni
// entre sí. Los iframes se cargan de forma perezosa (recién al activar su
// pestaña por primera vez) vía el atributo data-src.
(function () {
  "use strict";

  var tabs = Array.prototype.slice.call(document.querySelectorAll(".top-tab"));
  var panels = {};
  Array.prototype.slice.call(document.querySelectorAll(".view-panel")).forEach(function (panel) {
    var key = panel.id.replace(/^view-/, "");
    panels[key] = panel;
  });

  function activate(view) {
    tabs.forEach(function (btn) {
      var isActive = btn.getAttribute("data-view") === view;
      btn.classList.toggle("on", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    Object.keys(panels).forEach(function (key) {
      if (panels[key]) panels[key].hidden = key !== view;
    });
    var panel = panels[view];
    var frame = panel ? panel.querySelector("iframe[data-src]") : null;
    if (frame && !frame.getAttribute("src")) {
      frame.setAttribute("src", frame.getAttribute("data-src"));
    }
  }

  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      activate(btn.getAttribute("data-view"));
    });
  });
})();
