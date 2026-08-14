import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  SafeAreaView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';

interface CuitValidation {
  format_valid: boolean;
  check_digit: number | null;
  expected_check_digit: number | null;
  valid: boolean;
}

interface AssociatedCuit {
  cuit: string;
  role: 'primary' | 'associated';
  evidence?: string | null;
  validation?: CuitValidation;
  bcra?: any;
}

interface ChequeResult {
  id: string;
  cuit: string;
  cuit_validation?: CuitValidation;
  cuits?: AssociatedCuit[];
  cheque_numero: string;
  banco: string;
  importe: number;
  moneda: string;
  fecha_pago: string;
  librador: string;
  confidence?: any;
  bcra?: any;
  quote?: {
    plazoDias: number;
    tasaMensual: number;
    porcentaje: number;
    descuento: number;
    montoAPagar: number;
    plazoTransicion: number;
  };
  analysis: AnalyzeChequeResponse;
}

interface PersistedChequeRecord {
  id: string;
  cuit: string | null;
  cuitValidation?: string;
  cuits?: AssociatedCuit[];
  chequeNumero: string | null;
  banco: string | null;
  importe: number | null;
  moneda: string;
  fechaPago: string | null;
  librador: string | null;
  confidence?: any;
  bcra?: any;
  quote?: ChequeResult['quote'];
}

interface AnalyzeChequeResponse {
  success: boolean;
  origin: string;
  extraction?: {
    data?: {
      cuit_validation?: CuitValidation;
      cuits?: AssociatedCuit[];
      bcra?: any;
    };
  };
  quote?: ChequeResult['quote'] | null;
  record: PersistedChequeRecord;
}

export default function App() {
  const [apiUrl, setApiUrl] = useState('http://192.168.1.250:3000');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChequeResult | null>(null);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso denegado', 'Se requiere acceso a la cámara para fotografiar cheques.');
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets[0]) {
      const asset = pickerResult.assets[0];
      setImageUri(asset.uri);
      if (asset.base64) {
        setImageBase64(`data:image/jpeg;base64,${asset.base64}`);
      }
      setResult(null);
    }
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso denegado', 'Se requiere acceso a la galería para seleccionar cheques.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets[0]) {
      const asset = pickerResult.assets[0];
      setImageUri(asset.uri);
      if (asset.base64) {
        setImageBase64(`data:image/jpeg;base64,${asset.base64}`);
      }
      setResult(null);
    }
  };

  const analyzeCheque = async () => {
    if (!imageBase64) {
      Alert.alert('Imagen requerida', 'Por favor tomá una foto o seleccioná un cheque de la galería.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(`${apiUrl}/api/cheques/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64,
          filename: 'cheque_android.jpg',
          origin: 'android',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type');
      let data: any = {};
      try {
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          throw new Error(`Respuesta no JSON del servidor (HTTP ${response.status}): ${text.substring(0, 100)}`);
        }
      } catch (parseError: any) {
        if (parseError.message.includes('Respuesta no JSON')) throw parseError;
        throw new Error(`Error al interpretar la respuesta del servidor (HTTP ${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data.error || `Error HTTP ${response.status}`);
      }

      const analysis = data as AnalyzeChequeResponse;
      if (!analysis.record) {
        throw new Error('La respuesta del servidor no contiene el cheque persistido.');
      }

      const { record, extraction, quote } = analysis;
      setResult({
        id: record.id,
        cuit: record.cuit || '',
        cuit_validation: extraction?.data?.cuit_validation,
        cuits: record.cuits || extraction?.data?.cuits,
        cheque_numero: record.chequeNumero || '',
        banco: record.banco || '',
        importe: record.importe || 0,
        moneda: record.moneda || 'ARS',
        fecha_pago: record.fechaPago || '',
        librador: record.librador || '',
        confidence: record.confidence,
        bcra: record.bcra || extraction?.data?.bcra,
        quote: quote || record.quote,
        analysis,
      });
    } catch (error: any) {
      console.error(error);
      Alert.alert(
        'Error de Procesamiento',
        error.name === 'AbortError'
          ? 'La solicitud expiró (Timeout). Verificá tu conexión.'
          : error.message || 'No se pudo procesar el cheque.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ChequeClaro Android</Text>
        <Text style={styles.headerSubtitle}>Extracción y Validación v1</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.label}>URL del Servidor API:</Text>
          <TextInput
            style={styles.input}
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="https://..."
            autoCapitalize="none"
          />
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={takePhoto}>
            <Text style={styles.buttonText}>📷 Tomar Foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickImage}>
            <Text style={styles.secondaryButtonText}>🖼 Galería</Text>
          </TouchableOpacity>
        </View>

        {imageUri && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity
              style={styles.analyzeButton}
              onPress={analyzeCheque}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.analyzeButtonText}>⚡ Analizar Cheque</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={styles.loadingText}>Procesando cheque con IA y BCRA...</Text>
          </View>
        )}

        {result && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>📋 Resultado del Análisis</Text>
            
            <View style={styles.row}>
              <Text style={styles.key}>ID:</Text>
              <Text style={styles.val}>{result.id}</Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.subHeader}>CUIT Principal (PrestAdmin):</Text>
            <Text style={styles.cuitText}>{result.cuit || 'No detectado'}</Text>
            {result.cuit_validation && (
              <Text style={result.cuit_validation.valid ? styles.validText : styles.invalidText}>
                {result.cuit_validation.valid ? '✓ CUIT Válido (Módulo 11)' : '⚠ CUIT Inválido'}
              </Text>
            )}

            {result.cuits && result.cuits.length > 1 && (
              <View style={styles.associatedContainer}>
                <Text style={styles.subHeader}>CUITs Asociados ({result.cuits.length - 1}):</Text>
                {result.cuits
                  .filter((c) => c.role === 'associated')
                  .map((assoc, idx) => (
                    <View key={idx} style={styles.assocItem}>
                      <Text style={styles.cuitText}>• {assoc.cuit}</Text>
                      {assoc.validation && (
                        <Text style={assoc.validation.valid ? styles.validText : styles.invalidText}>
                          {assoc.validation.valid ? '✓ Válido' : '⚠ Inválido'}
                        </Text>
                      )}
                    </View>
                  ))}
              </View>
            )}

            <View style={styles.divider} />

            <Text style={styles.subHeader}>Datos del Cheque:</Text>
            <View style={styles.row}><Text style={styles.key}>Número:</Text><Text style={styles.val}>{result.cheque_numero}</Text></View>
            <View style={styles.row}><Text style={styles.key}>Banco:</Text><Text style={styles.val}>{result.banco}</Text></View>
            <View style={styles.row}><Text style={styles.key}>Importe:</Text><Text style={styles.val}>{result.moneda} ${result.importe?.toLocaleString()}</Text></View>
            <View style={styles.row}><Text style={styles.key}>Vencimiento:</Text><Text style={styles.val}>{result.fecha_pago}</Text></View>
            <View style={styles.row}><Text style={styles.key}>Librador:</Text><Text style={styles.val}>{result.librador}</Text></View>

            {result.quote && (
              <>
                <View style={styles.divider} />
                <Text style={styles.subHeader}>💰 Cotización de Descuento:</Text>
                <View style={styles.row}><Text style={styles.key}>Plazo:</Text><Text style={styles.val}>{result.quote.plazoDias} días</Text></View>
                <View style={styles.row}><Text style={styles.key}>Tasa Mensual:</Text><Text style={styles.val}>{result.quote.tasaMensual}%</Text></View>
                <View style={styles.row}><Text style={styles.key}>Descuento:</Text><Text style={styles.val}>${result.quote.descuento?.toLocaleString()} ({result.quote.porcentaje}%)</Text></View>
                <View style={styles.row}><Text style={styles.key}>Valor a Pagar Hoy:</Text><Text style={styles.valBold}>${result.quote.montoAPagar?.toLocaleString()}</Text></View>
              </>
            )}

            <View style={styles.divider} />
            <Text style={styles.successBadge}>🟢 Persistido en Supabase REST</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  headerSubtitle: { fontSize: 12, color: '#64748b' },
  scrollContent: { padding: 16 },
  section: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  primaryButton: { flex: 1, backgroundColor: '#0284c7', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  secondaryButton: { flex: 1, backgroundColor: '#e2e8f0', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  secondaryButtonText: { color: '#334155', fontWeight: 'bold', fontSize: 16 },
  imagePreviewContainer: { alignItems: 'center', marginBottom: 20 },
  previewImage: { width: '100%', height: 200, borderRadius: 8, resizeMode: 'contain', backgroundColor: '#e2e8f0', marginBottom: 12 },
  analyzeButton: { width: '100%', backgroundColor: '#16a34a', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  analyzeButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  loadingContainer: { alignItems: 'center', marginVertical: 24 },
  loadingText: { marginTop: 8, color: '#64748b', fontSize: 14 },
  resultCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, color: '#0f172a', borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, marginBottom: 30 },
  resultTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 12 },
  subHeader: { fontSize: 14, fontWeight: 'bold', color: '#334155', marginTop: 8, marginBottom: 4 },
  cuitText: { fontSize: 15, fontWeight: '600', color: '#0284c7' },
  associatedContainer: { marginTop: 6, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#cbd5e1' },
  assocItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 2 },
  validText: { color: '#16a34a', fontSize: 13, fontWeight: '600' },
  invalidText: { color: '#dc2626', fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  key: { color: '#64748b', fontSize: 14 },
  val: { color: '#0f172a', fontSize: 14, fontWeight: '500' },
  valBold: { color: '#16a34a', fontSize: 16, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 12 },
  successBadge: { textAlign: 'center', color: '#16a34a', fontWeight: 'bold', fontSize: 13, marginTop: 4 }
});
