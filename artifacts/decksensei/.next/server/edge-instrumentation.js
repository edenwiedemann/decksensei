// runtime can't be in strict mode because a global variable is assign and maybe created.
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["instrumentation"],{

/***/ "(instrument)/./instrumentation.ts":
/*!****************************!*\
  !*** ./instrumentation.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   register: () => (/* binding */ register)\n/* harmony export */ });\n/**\n * Next.js Instrumentation hook — roda no boot do servidor.\n * Importar env.ts aqui garante que a validação de variáveis\n * de ambiente acontece antes de qualquer request ser processada.\n *\n * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation\n */ async function register() {\n    // Runs in both dev and production for the Node.js runtime.\n    // Edge runtime skipped intentionally (no server secrets needed there).\n    if (false) {}\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vaW5zdHJ1bWVudGF0aW9uLnRzIiwibWFwcGluZ3MiOiI7Ozs7QUFBQTs7Ozs7O0NBTUMsR0FDTSxlQUFlQTtJQUNwQiwyREFBMkQ7SUFDM0QsdUVBQXVFO0lBQ3ZFLElBQUlDLEtBQW1DLEVBQUUsRUFFeEM7QUFDSCIsInNvdXJjZXMiOlsiL2hvbWUvcnVubmVyL3dvcmtzcGFjZS9hcnRpZmFjdHMvZGVja3NlbnNlaS9pbnN0cnVtZW50YXRpb24udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBOZXh0LmpzIEluc3RydW1lbnRhdGlvbiBob29rIOKAlCByb2RhIG5vIGJvb3QgZG8gc2Vydmlkb3IuXG4gKiBJbXBvcnRhciBlbnYudHMgYXF1aSBnYXJhbnRlIHF1ZSBhIHZhbGlkYcOnw6NvIGRlIHZhcmnDoXZlaXNcbiAqIGRlIGFtYmllbnRlIGFjb250ZWNlIGFudGVzIGRlIHF1YWxxdWVyIHJlcXVlc3Qgc2VyIHByb2Nlc3NhZGEuXG4gKlxuICogRG9jczogaHR0cHM6Ly9uZXh0anMub3JnL2RvY3MvYXBwL2J1aWxkaW5nLXlvdXItYXBwbGljYXRpb24vb3B0aW1pemluZy9pbnN0cnVtZW50YXRpb25cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlZ2lzdGVyKCkge1xuICAvLyBSdW5zIGluIGJvdGggZGV2IGFuZCBwcm9kdWN0aW9uIGZvciB0aGUgTm9kZS5qcyBydW50aW1lLlxuICAvLyBFZGdlIHJ1bnRpbWUgc2tpcHBlZCBpbnRlbnRpb25hbGx5IChubyBzZXJ2ZXIgc2VjcmV0cyBuZWVkZWQgdGhlcmUpLlxuICBpZiAocHJvY2Vzcy5lbnYuTkVYVF9SVU5USU1FICE9PSBcImVkZ2VcIikge1xuICAgIGF3YWl0IGltcG9ydChcIi4vbGliL2VudlwiKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbInJlZ2lzdGVyIiwicHJvY2VzcyIsImVudiIsIk5FWFRfUlVOVElNRSJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(instrument)/./instrumentation.ts\n");

/***/ })

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ var __webpack_exports__ = (__webpack_exec__("(instrument)/./instrumentation.ts"));
/******/ (_ENTRIES = typeof _ENTRIES === "undefined" ? {} : _ENTRIES).middleware_instrumentation = __webpack_exports__;
/******/ }
]);