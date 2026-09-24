import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Boton } from '@/components/Boton';
import { useAuth } from '@/hooks/useAuth';
import { colores, espaciado, radio } from '@/lib/tema';

export default function Login() {
  const { entrar, authConfigurada } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);

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
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo iniciar sesión');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={estilos.pantalla}>
      {!authConfigurada ? (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTexto}>
            Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en .env
          </Text>
        </View>
      ) : (
        <View style={estilos.formulario}>
          <Text style={estilos.etiqueta}>Email</Text>
          <TextInput
            style={estilos.campo}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="tu@email.com"
            placeholderTextColor={colores.textoSecundario}
            value={email}
            onChangeText={setEmail}
          />
          <Text style={estilos.etiqueta}>Contraseña</Text>
          <TextInput
            style={estilos.campo}
            autoCapitalize="none"
            autoComplete="password"
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colores.textoSecundario}
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
      <Link href="/registro" style={estilos.enlace}>
        ¿Aún no tienes cuenta? Regístrate
      </Link>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
    padding: espaciado.lg,
    gap: espaciado.lg,
  },
  formulario: {
    gap: espaciado.sm,
  },
  etiqueta: {
    fontSize: 14,
    fontWeight: '600',
    color: colores.texto,
    marginTop: espaciado.xs,
  },
  campo: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.md,
    paddingHorizontal: espaciado.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colores.texto,
    backgroundColor: colores.fondo,
  },
  aviso: {
    backgroundColor: '#fef3c7',
    borderRadius: radio.md,
    padding: espaciado.md,
  },
  avisoTexto: {
    color: '#92400e',
    fontSize: 14,
    lineHeight: 20,
  },
  enlace: {
    textAlign: 'center',
    color: colores.primario,
    fontSize: 15,
    fontWeight: '600',
  },
});
