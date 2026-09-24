import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Boton } from '@/components/Boton';
import { useAuth } from '@/hooks/useAuth';
import { colores, espaciado, radio } from '@/lib/tema';

export default function Registro() {
  const { registrarse, authConfigurada } = useAuth();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!nombre.trim() || !email.trim() || password.length < 6) {
      Alert.alert('Revisa los datos', 'Nombre, email y contraseña (mín. 6) son obligatorios');
      return;
    }
    setEnviando(true);
    try {
      await registrarse(email.trim(), password, nombre.trim());
      Alert.alert('Cuenta creada', 'Revisa tu email para confirmar el registro.');
      router.replace('/login');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo registrar');
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
          <Text style={estilos.etiqueta}>Nombre</Text>
          <TextInput
            style={estilos.campo}
            autoComplete="name"
            placeholder="Tu nombre"
            placeholderTextColor={colores.textoSecundario}
            value={nombre}
            onChangeText={setNombre}
          />
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
            secureTextEntry
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor={colores.textoSecundario}
            value={password}
            onChangeText={setPassword}
          />
          <Boton
            titulo={enviando ? 'Creando...' : 'Crear cuenta'}
            onPress={() => void enviar()}
            cargando={enviando}
          />
        </View>
      )}
      <Link href="/login" style={estilos.enlace}>
        ¿Ya tienes cuenta? Inicia sesión
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
