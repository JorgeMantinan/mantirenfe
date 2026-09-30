import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Boton } from '@/components/Boton';
import { errorAuth } from '@/i18n/errores-auth';
import { useAuth } from '@/hooks/useAuth';
import { entrarConOAuth } from '@/lib/oauth';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, radio, type Paleta } from '@/lib/tema';

export default function Registro() {
  const { registrarse, authConfigurada } = useAuth();
  const { paleta } = useTema();
  const { t } = useTranslation();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [entrandoOAuth, setEntrandoOAuth] = useState(false);

  const oauth = async () => {
    setEntrandoOAuth(true);
    try {
      const resultado = await entrarConOAuth('google');
      if (resultado.ok) {
        router.replace('/(tabs)');
        return;
      }
      if (resultado.error !== 'cancelado') {
        Alert.alert(t('comunes.error'), t('login.oauthError'));
      }
    } finally {
      setEntrandoOAuth(false);
    }
  };
  const s = useMemo(() => estilos(paleta), [paleta]);

  const enviar = async () => {
    if (!nombre.trim() || !email.trim() || password.length < 6) {
      Alert.alert(t('registro.revisaTitulo'), t('registro.revisaCuerpo'));
      return;
    }
    setEnviando(true);
    try {
      const pendienteConfirmacion = await registrarse(email.trim(), password, nombre.trim());
      Alert.alert(
        t('registro.creadaTitulo'),
        pendienteConfirmacion ? t('registro.creadaConfirmacion') : t('registro.creadaDentro'),
      );
      router.replace(pendienteConfirmacion ? '/login' : '/(tabs)');
    } catch (error) {
      Alert.alert(
        t('comunes.error'),
        error instanceof Error ? errorAuth(error.message) : t('registro.errorGenerico'),
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={s.pantalla}>
      {!authConfigurada ? (
        <View style={s.aviso}>
          <Text style={s.avisoTexto}>{t('comunes.avisoConfig')}</Text>
        </View>
      ) : (
        <View style={s.formulario}>
          <Text style={s.etiqueta}>{t('comunes.nombre')}</Text>
          <TextInput
            style={s.campo}
            autoComplete="name"
            placeholder={t('registro.placeholderNombre')}
            placeholderTextColor={paleta.textoSecundario}
            value={nombre}
            onChangeText={setNombre}
          />
          <Text style={s.etiqueta}>{t('comunes.email')}</Text>
          <TextInput
            style={s.campo}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="tu@email.com"
            placeholderTextColor={paleta.textoSecundario}
            value={email}
            onChangeText={setEmail}
          />
          <Text style={s.etiqueta}>{t('comunes.contrasena')}</Text>
          <TextInput
            style={s.campo}
            autoCapitalize="none"
            secureTextEntry
            placeholder={t('registro.placeholderContrasena')}
            placeholderTextColor={paleta.textoSecundario}
            value={password}
            onChangeText={setPassword}
          />
          <Boton
            titulo={enviando ? t('registro.creando') : t('comunes.crearCuenta')}
            onPress={() => void enviar()}
            cargando={enviando}
          />
          <Boton
            titulo={entrandoOAuth ? t('login.entrando') : t('login.google')}
            variante="contorno"
            onPress={() => void oauth()}
            cargando={entrandoOAuth}
          />
        </View>
      )}
      <Link href="/login" style={s.enlace}>
        {t('registro.cuentaExiste')}
      </Link>
    </View>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondo,
      padding: espaciado.lg,
      gap: espaciado.lg,
    },
    formulario: {
      gap: espaciado.sm,
    },
    etiqueta: {
      fontSize: 14,
      fontWeight: '600',
      color: c.texto,
      marginTop: espaciado.xs,
    },
    campo: {
      borderWidth: 1,
      borderColor: c.borde,
      borderRadius: radio.md,
      paddingHorizontal: espaciado.md,
      paddingVertical: 12,
      fontSize: 16,
      color: c.texto,
      backgroundColor: c.fondo,
    },
    aviso: {
      backgroundColor: c.fondoSecundario,
      borderWidth: 1,
      borderColor: c.aviso,
      borderRadius: radio.md,
      padding: espaciado.md,
    },
    avisoTexto: {
      color: c.aviso,
      fontSize: 14,
      lineHeight: 20,
    },
    enlace: {
      textAlign: 'center',
      color: c.primario,
      fontSize: 15,
      fontWeight: '600',
    },
  });
