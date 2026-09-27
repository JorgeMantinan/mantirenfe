import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { traducirErrorAuth } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { useAuth } from '@/hooks/useAuth';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, radio, type Paleta } from '@/lib/tema';

export default function Login() {
  const { entrar, authConfigurada } = useAuth();
  const { paleta } = useTema();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const s = useMemo(() => estilos(paleta), [paleta]);

  const enviar = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Faltan datos', 'Introduce email y contraseña');
      return;
    }
    setEnviando(true);
    try {
      await entrar(email.trim(), password);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? traducirErrorAuth(error.message) : 'No se pudo iniciar sesión',
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={s.pantalla}>
      {!authConfigurada ? (
        <View style={s.aviso}>
          <Text style={s.avisoTexto}>
            Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en .env
          </Text>
        </View>
      ) : (
        <View style={s.formulario}>
          <Text style={s.etiqueta}>Email</Text>
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
          <Text style={s.etiqueta}>Contraseña</Text>
          <TextInput
            style={s.campo}
            autoCapitalize="none"
            autoComplete="password"
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={paleta.textoSecundario}
            value={password}
            onChangeText={setPassword}
          />
          <Boton
            titulo={enviando ? 'Entrando...' : 'Entrar'}
            onPress={() => void enviar()}
            cargando={enviando}
          />
        </View>
      )}
      <Link href="/registro" style={s.enlace}>
        ¿Aún no tienes cuenta? Regístrate
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
