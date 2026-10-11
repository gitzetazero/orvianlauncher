# Orvian Launcher

Launcher de escritorio para Windows del servidor privado **Orvian**. Con un solo botón instala Java, Minecraft
1.20.1, Forge 47.4.23 y el modpack de la comunidad, lo mantiene actualizado y lanza el juego.

Hecho con Electron, React, Vite y TypeScript. Interfaz en español. Pensado para un grupo pequeño de jugadores, no es un launcher genérico.

## Funciones

- **Cuenta Microsoft:** la sesión se renueva sola; los tokens se guardan cifrados con `safeStorage`.
- **Instalación:** Java 17, Minecraft, Forge, librerías y assets, con progreso por pasos y bytes.
- **Modpack:** se descarga de GitHub Releases con verificación SHA-256 y escritura atómica. Se conservan las configuraciones del jugador.
- **Sin conexión:** con el modpack instalado se puede jugar sin red.
- **Servidor:** estado en vivo (jugadores, latencia) y botón «Jugar en el servidor».
- **Mods:** lista de instalados e instalación desde Modrinth y CurseForge.
- **Soporte:** resumen de fallos del juego y «Copiar diagnóstico» (sin tokens).
- **Autoactualización:** el launcher se actualiza solo, nunca mientras se juega.
- **Admin:** panel para publicar versiones del modpack, visible solo para cuentas autorizadas.

## Desarrollo

Requiere Node.js 22+. Empaquetar el instalador (`dist:win`) requiere Windows; el resto funciona en cualquier sistema.

```bash
npm ci               # instala dependencias
npm run dev          # abre el launcher con recarga en caliente
npm run lint         # ESLint + TypeScript
npm test             # tests unitarios y de integración (Vitest)
npm run test:e2e     # pruebas de extremo a extremo (Playwright + Electron)
npm run build        # compila main y renderer
npm run dist:win     # genera el instalador NSIS en release/
```

Variables opcionales (solo en desarrollo, se ignoran en versiones empaquetadas; ver `electron/config.ts`):
`ORVIAN_DATA_DIR`, `ORVIAN_MANIFEST_URL`, `ORVIAN_PACK_REPO`, `ORVIAN_SERVER`, `ORVIAN_SPLASH_MS`.

## Estructura

```
electron/    proceso main (Node): toda la lógica; preload.ts es el puente hacia la interfaz
src/shared/  código puro compartido: tipos, errores, manifest, estados
src/ui/      interfaz React
e2e/, tests/ pruebas
```

## Publicar

- **Launcher:** crear un tag `vX.Y.Z` igual a la versión de `package.json`. El workflow `release.yml` sube un **borrador** que hay que publicar a mano.
- **Modpack:** desde el panel Admin del launcher.

Pasos completos y pruebas manuales en [`RELEASING.md`](RELEASING.md).

## Limitaciones

- El instalador **no está firmado**: SmartScreen avisará («Más información › Ejecutar de todos modos»).
