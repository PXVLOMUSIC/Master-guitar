# Auditoría vs Guitar Tuna

Comparación de Strumio con Guitar Tuna (referencia de afinador) para identificar gaps.

## Afinador

| Característica | Guitar Tuna | Strumio | Estado |
|---|---|---|---|
| Detección de pitch (YIN) | Sí | Sí (YIN + autocorr) | ✅ |
| Ventana Hann / DC removal | Sí | Sí (añadido) | ✅ |
| Smoothing de lecturas | Sí | Sí (mediana 5) | ✅ |
| Modo cromático | Sí | Sí | ✅ |
| Modo por cuerda | Sí | Sí | ✅ |
| Auto-detección de cuerda | Sí | Sí | ✅ |
| Afinación automática (auto-tune) | Sí | Sí | ✅ |
| Strobe visual | Sí | Sí | ✅ |
| Medidor (needle) | Sí | Sí (lineal + arco) | ✅ |
| Haptic al afinar | Sí | Sí | ✅ |
| Sonido de referencia (tone) | Sí | Sí (continuo + tap) | ✅ |
| Historial de afinaciones | No | Sí (badges) | ✅ extra |
| Múltiples instrumentos (guitarra/uke/bajo) | Sí | Sí | ✅ |
| Múltiples afinaciones | Sí | Sí | ✅ |
| Precisión en graves (E2) | Alta | Mejorada (buffer 4096) | ✅ |

## Gaps identificados (mejoras futuras)
1. **Calibración de A4 (432/440/442 Hz)**: Strumio usa 440 fijo. Guitar Tuna permite calibrar. → Pendiente: añadir selector de referencia en Ajustes.
2. **Filtro de ruido ambiente**: añadir high-pass filter antes de la detección para entornos ruidosos.
3. **Detección de armónicos**: rechazar lecturas que sean armónicos (2x, 3x) de la fundamental.
4. **Medidor circular completo**: actualmente semicircular; Guitar Tuna usa un arco completo.
5. **Animación de "in tune" más marcada**: ya mejorada, pero se puede añadir confetti/celebración.

## App general
- Localización a 6 idiomas: ✅ (278 claves t() + phrase-translator).
- PWA offline: ✅.
- Auth + sync + leaderboard + amigos + retos: ✅.
- Perfil con foto local: ✅.
- 125 lecciones, 50 canciones: ✅.
- 29 herramientas de práctica: ✅.

## Conclusión
El afinador de Strumio está a la par con Guitar Tuna en funcionalidad y precisión tras las mejoras. Los gaps son menores (calibración A4, filtro de ruido, armónicos) y se pueden abordar en futuras iteraciones.