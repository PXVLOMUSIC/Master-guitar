# Librerías gratuitas de samples de calidad

## Batería (Drum Kits)

| Librería | Licencia | Calidad | Notas |
|---|---|---|---|
| **Big Rusty Drums** (Karoryfer) | CC0 | Alta | Ya integrado. Kit acústico completo. |
| **DrumGizmo** (DGS) | CC-BY/CC0 | Muy alta | Kits de batería completos con múltiples velocidades y round-robin. Requiere conversión a FLAC. |
| **AVL Drumkits** | CC0 | Alta | Kits gratuitos en formato SFZ. |
| **SSO (Sonatina Symphonic Orchestra)** | CC-BY | Alta | Batería orquestal + percusión. |
| **Freesound.org** | CC0/CC-BY | Variable | Samples individuales. Requiere API key y curación manual. |

## Bajo (Bass)

| Librería | Licencia | Calidad | Notas |
|---|---|---|---|
| **Pastabass** (Karoryfer) | CC0 | Alta | Ya integrado. Bajo eléctrico P-bass. |
| **tonejs-instruments (bass-electric)** | CC-BY-3.0 | Media | Bajo eléctrico básico. |
| **Freesound** | CC0/CC-BY | Variable | Samples individuales de bajo. |

## Guitarra

| Librería | Licencia | Calidad | Notas |
|---|---|---|---|
| **Emilyguitar** (Karoryfer) | CC0 | Alta | Ya integrado. Guitarra acústica. |
| **tonejs-instruments** | CC-BY-3.0 | Media-Alta | Guitarra eléctrica, nylon. Ya integrado. |
| **University of Iowa** | CC | Alta | Samples académicos de alta calidad. |

## Piano

| Librería | Licencia | Calidad | Notas |
|---|---|---|---|
| **tonejs-instruments (piano)** | CC-BY-3.0 | Media | Ya integrado. Piano básico. |
| **Salamander Grand Piano** | CC-BY | Muy alta | Piano de cola de alta calidad. Requiere conversión. |
| **Philharmonia Orchestra** | CC-BY-SA | Alta | Samples orquestales. |

## Percusión

| Librería | Licencia | Calidad | Notas |
|---|---|---|---|
| **Body Percussion** (Karoryfer) | CC0 | Alta | Ya integrado. |
| **VCSL** (Versilian) | CC0 | Alta | Percusión orquestal. Ya integrado. |
| **Freesound** | CC0/CC-BY | Variable | Samples individuales de percusión. |

## Efectos (implementados en código)

| Efecto | Implementación | Estado |
|---|---|---|
| Reverb (convolver) | Ya implementado en getRealBus() | ✅ |
| Chorus | Por implementar | ⏳ |
| Delay | Por implementar | ⏳ |
| Distorsión | Por implementar | ⏳ |
| EQ (filtros) | Por implementar | ⏳ |

## Prioridades de implementación

1. **Efectos (chorus, delay, distorsión)** — implementar en audio.js (1-2 días).
2. **Más samples de batería** — descargar DrumGizmo kits y convertir (2-3 días).
3. **Más canciones con tablaturas** — añadir más riffs y canciones (1 día).
4. **Más instrumentos** — piano (Salamander), orquesta (Philharmonia).