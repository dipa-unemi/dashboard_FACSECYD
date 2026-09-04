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
    rendimiento: document.getElementById("view-rendimiento"),
    graduados: document.getElementById("view-graduados")
  };
  // Cada vista independiente vive en su propio iframe y se carga sólo la primera
  // vez que se abre: ninguna paga el coste de arrancar hasta que se la pide.
  var frames = {
    rendimiento: document.getElementById("rendimientoFrame"),
    graduados: document.getElementById("graduadosFrame")
  };

  function activate(view) {
    tabs.forEach(function (btn) {
      var isActive = btn.getAttribute("data-view") === view;
      btn.classList.toggle("on", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    Object.keys(panels).forEach(function (key) {
      if (panels[key]) panels[key].hidden = key !== view;
    });
    var frame = frames[view];
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
