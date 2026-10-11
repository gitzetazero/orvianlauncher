# Orvian Launcher

El launcher oficial del servidor **Orvian** para Windows. Con un solo botón instala todo lo necesario (Java, Minecraft 1.20.1, Forge y el modpack), lo mantiene actualizado y abre el juego.

## Cómo usarlo

1. Descarga el instalador desde la sección de [Releases](../../releases) e instálalo.
2. Inicia sesión con tu cuenta de Microsoft (necesitas Minecraft Java).
3. Pulsa **Instalar** y espera a que termine. Solo se hace la primera vez.
4. Pulsa **Jugar**, o **Jugar en el servidor** para entrar directamente.

> Windows puede mostrar un aviso de SmartScreen porque el instalador no está firmado. Pulsa «Más información» y luego «Ejecutar de todos modos».

## Qué hace

- Instala y actualiza el modpack automáticamente, verificando cada archivo. Tus configuraciones se conservan.
- Muestra si el servidor está en línea, cuántos jugadores hay y las novedades de cada versión.
- Permite instalar mods extra desde Modrinth y CurseForge.
- Si ya está instalado, puedes jugar sin conexión.
- Se actualiza solo, y nunca mientras juegas.
- Si el juego se cierra por un error, te muestra qué pasó. El botón «Copiar diagnóstico» genera un texto (sin datos personales) para pedir ayuda.

## Privacidad

Tu sesión se guarda cifrada en tu equipo y los registros no contienen tokens. Todo se guarda en `%APPDATA%/Orvian`.

## Para desarrolladores

Requiere Node.js 22+.

```bash
npm ci            # instalar dependencias
npm run dev       # abrir el launcher en modo desarrollo
npm test          # tests
npm run dist:win  # generar el instalador (requiere Windows)
```

Más detalles sobre cómo publicar versiones en [`RELEASING.md`](RELEASING.md).
