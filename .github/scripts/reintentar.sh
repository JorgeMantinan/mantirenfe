#!/usr/bin/env bash
# Reintenta un comando ante fallos transitorios.
#
# Uso:  bash .github/scripts/reintentar.sh <comando...>
#
# Motivo: las tiradas nocturnas del worker se caen con errores de red de
# Supabase que no tienen nada que ver con el código:
#
#   Can't reach database server at `aws-1-eu-west-1.pooler.supabase.com:5432`
#   FATAL: (EAUTHQUERY) auth_query secret check timed out
#
# Un reintento con espera en el mismo job resuelve la tirada y evita el
# correo de "Failed in N seconds" de madrugada.
#
# Ajuste por variables de entorno:
#   REINTENTOS=3          intentos totales
#   ESPERA_SEGUNDOS=30    espera entre intentos (lineal: 30 s, 60 s, ...)
set -uo pipefail

intentos="${REINTENTOS:-3}"
espera="${ESPERA_SEGUNDOS:-30}"

if [ "$#" -eq 0 ]; then
  echo "::error::uso: reintentar.sh <comando...>"
  exit 2
fi

descripcion="$*"

for ((intento = 1; intento <= intentos; intento++)); do
  echo "::group::Intento $intento/$intentos: $descripcion"
  "$@"
  codigo=$?
  echo "::endgroup::"

  if [ "$codigo" -eq 0 ]; then
    if [ "$intento" -gt 1 ]; then
      echo "OK tras $intento intentos: $descripcion"
    fi
    exit 0
  fi

  if [ "$intento" -lt "$intentos" ]; then
    espera_intento=$((espera * intento))
    echo "::warning::Fallo $intento/$intentos (código $codigo); reintento en ${espera_intento}s: $descripcion"
    sleep "$espera_intento"
  fi
done

echo "::error::$descripcion falló $intentos veces (último código $codigo)"
exit 1
