// Navegación entre las vistas de nivel superior del dashboard.
// Aislado de app.js a propósito: la vista "Rendimiento Académico" es un
// dashboard independiente (rendimiento_academico.html) con su propio CSS/JS,
// cargado dentro de un iframe para evitar cualquier choque de estilos o
// nombres globales con el dashboard de Perfil Estudiantil.
(function () {
  "use strict";

  var tabs = Array.prototype.slice.call(document.querySelectorAll(".top-tab"));
  var panels = {
    perfil: document.getElementById("view-perfil"),
    rendimiento: document.getElementById("view-rendimiento")
  };
  var frame = document.getElementById("rendimientoFrame");

  function activate(view) {
    tabs.forEach(function (btn) {
      var isActive = btn.getAttribute("data-view") === view;
      btn.classList.toggle("on", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    Object.keys(panels).forEach(function (key) {
      if (panels[key]) panels[key].hidden = key !== view;
    });
    if (view === "rendimiento" && frame && !frame.getAttribute("src")) {
      frame.setAttribute("src", frame.getAttribute("data-src"));
    }
  }

  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      activate(btn.getAttribute("data-view"));
    });
  });
})();
