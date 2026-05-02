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
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   register: () => (/* binding */ register)\n/* harmony export */ });\n/**\n * Next.js Instrumentation hook — roda no boot do servidor.\n * Importar env.ts aqui garante que a validação de variáveis\n * de ambiente acontece antes de qualquer request ser processada.\n *\n * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation\n */ async function register() {\n    // Runs in both dev and production for the Node.js runtime.\n    // Edge runtime skipped intentionally (no server secrets needed there).\n    if (false) {}\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vaW5zdHJ1bWVudGF0aW9uLnRzIiwibWFwcGluZ3MiOiI7Ozs7QUFBQTs7Ozs7O0NBTUMsR0FDTSxlQUFlQTtJQUNwQiwyREFBMkQ7SUFDM0QsdUVBQXVFO0lBQ3ZFLElBQUlDLEtBQW1DLEVBQUUsRUFFeEM7QUFDSCIsInNvdXJjZXMiOlsiL2hvbWUvcnVubmVyL3dvcmtzcGFjZS9hcnRpZmFjdHMvdG9wZGVja2NvYWNoL2luc3RydW1lbnRhdGlvbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE5leHQuanMgSW5zdHJ1bWVudGF0aW9uIGhvb2sg4oCUIHJvZGEgbm8gYm9vdCBkbyBzZXJ2aWRvci5cbiAqIEltcG9ydGFyIGVudi50cyBhcXVpIGdhcmFudGUgcXVlIGEgdmFsaWRhw6fDo28gZGUgdmFyacOhdmVpc1xuICogZGUgYW1iaWVudGUgYWNvbnRlY2UgYW50ZXMgZGUgcXVhbHF1ZXIgcmVxdWVzdCBzZXIgcHJvY2Vzc2FkYS5cbiAqXG4gKiBEb2NzOiBodHRwczovL25leHRqcy5vcmcvZG9jcy9hcHAvYnVpbGRpbmcteW91ci1hcHBsaWNhdGlvbi9vcHRpbWl6aW5nL2luc3RydW1lbnRhdGlvblxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVnaXN0ZXIoKSB7XG4gIC8vIFJ1bnMgaW4gYm90aCBkZXYgYW5kIHByb2R1Y3Rpb24gZm9yIHRoZSBOb2RlLmpzIHJ1bnRpbWUuXG4gIC8vIEVkZ2UgcnVudGltZSBza2lwcGVkIGludGVudGlvbmFsbHkgKG5vIHNlcnZlciBzZWNyZXRzIG5lZWRlZCB0aGVyZSkuXG4gIGlmIChwcm9jZXNzLmVudi5ORVhUX1JVTlRJTUUgIT09IFwiZWRnZVwiKSB7XG4gICAgYXdhaXQgaW1wb3J0KFwiLi9saWIvZW52XCIpO1xuICB9XG59XG4iXSwibmFtZXMiOlsicmVnaXN0ZXIiLCJwcm9jZXNzIiwiZW52IiwiTkVYVF9SVU5USU1FIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(instrument)/./instrumentation.ts\n");

/***/ })

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ var __webpack_exports__ = (__webpack_exec__("(instrument)/./instrumentation.ts"));
/******/ (_ENTRIES = typeof _ENTRIES === "undefined" ? {} : _ENTRIES).middleware_instrumentation = __webpack_exports__;
/******/ }
]);