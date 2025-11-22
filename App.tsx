import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Image, TouchableOpacity, Text, Alert, ViewStyle, PermissionsAndroid, Platform, Modal, ScrollView } from 'react-native';
// Bluetooth: usamos la librería instalada `react-native-bluetooth-serial`
// Se usa require para evitar problemas de tipado si no están los tipos instalados
// @ts-ignore
import BluetoothSerial from 'react-native-bluetooth-classic';

// --- CONSTANTES DEL JUEGO ---

// Tamaño de cada celda en pixeles para la UI
const CELL_SIZE = 40;
// Escala para sprites (abeja y flor)
const SPRITE_SCALE = 0.9;
// Ruta de la imagen de la abeja
const BEE_IMAGE = require('./assets/bee.png'); // Asegúrate de tener una imagen de abeja en la carpeta 'assets'
// Ruta de la imagen de la flor (objetivo)
const FLOWER_IMAGE = require('./assets/flower.png'); // Asegúrate de tener una imagen de flor en la carpeta 'assets'
// Ruta de la imagen de la hierba/pasto (asset para celdas 'G')
const GRASS_IMAGE = require('./assets/road.png'); // Actualmente usado para camino/road
const GRASS_TILE_IMAGE = require('./assets/grass.png'); // Imagen específica para celdas 'G'
// Nuevos assets de arbustos solicitados
const REDBUSH_IMAGE = require('./assets/redbush.png');
const BLUEBUSH_IMAGE = require('./assets/bluebush.png');
// Asset de agua
const WATER_IMAGE = require('./assets/water.png');
// Assets de vallas (Top, Bottom, Left, Right)
const FENCE_T_IMAGE = require('./assets/fenceT.png');
const FENCE_B_IMAGE = require('./assets/fenceB.png');
const FENCE_L_IMAGE = require('./assets/fenceL.png');
const FENCE_R_IMAGE = require('./assets/fenceR.png');

// Tipos de celdas en el mapa
const CELL_TYPES = {
  EMPTY: 0,
  PATH: 1, // Camino por donde puede ir la abeja
  OBSTACLE: 2, // Muro o elemento por donde no puede pasar
  FLOWER: 3, // Objetivo
  WATER: 4, // El estanque en el primer mapa
  BERRIES: 5, // Las bayas rojas
};

// --- MAPA 1: Abeja a la flor con estanque ---
// M = Muro/Obstáculo, P = Camino, F = Flor, W = Agua, B = Bayas
const MAP1_LAYOUT = [
  ['M', 'M', 'M', 'M', 'M', 'M', 'M'],
  ['M', 'P', 'P', 'F', 'P', 'P', 'M'],
  ['M', 'P', 'W', 'W', 'W', 'P', 'M'],
  ['M', 'P', 'P', 'W', 'P', 'P', 'M'],
  ['M', 'R', 'P', 'P', 'P', 'G', 'M'],
  ['M', 'P', 'P', 'G', 'G', 'G', 'M'],
  ['M', 'P', 'U', 'G', 'G', 'G', 'M'],
  ['M', 'P', 'P', 'G', 'G', 'G', 'M'],
  ['M', 'G', 'P', 'G', 'G', 'G', 'M'],
  ['M', 'M', 'M', 'M', 'M', 'M', 'M'],
];
// Posición inicial de la abeja en MAP1 (fila, columna)
// Convertimos la notación de abajo a la izquierda a un índice de array [row, col]
// Si 'abajo' es la fila 9 (la última fila de P's antes del muro)
// Y 'izquierda' es la columna 1 (la primera P)
const MAP1_START_POS = [8, 2]; // Corresponde a la fila 8, columna 1 en el array 0-indexado

// --- MAPA 2: Abeja a la flor sin obstáculos complejos ---
const MAP2_LAYOUT = [
  ['M', 'M', 'M', 'M', 'M', 'M', 'M'],
  ['M', 'P', 'P', 'P', 'P', 'F', 'M'],
  ['M', 'P', 'P', 'P', 'P', 'P', 'M'],
  ['M', 'P', 'P', 'P', 'P', 'P', 'M'],
  ['M', 'P', 'P', 'P', 'P', 'P', 'M'],
  ['M', 'P', 'P', 'P', 'P', 'P', 'M'],
  ['M', 'P', 'P', 'G', 'G', 'G', 'M'],
  ['M', 'P', 'P', 'G', 'G', 'G', 'M'],
  ['M', 'P', 'P', 'G', 'G', 'G', 'M'],
  ['M', 'M', 'M', 'M', 'M', 'M', 'M'],
];
// Posición inicial de la abeja en MAP2
const MAP2_START_POS = [8, 1]; // Mismo concepto que el mapa 1

// --- Componente principal de la aplicación ---
export default function App() {
  const [currentMapIndex, setCurrentMapIndex] = useState(0); // 0 para Mapa 1, 1 para Mapa 2
  const currentMapLayout = currentMapIndex === 0 ? MAP1_LAYOUT : MAP2_LAYOUT;
  const currentStartPos = currentMapIndex === 0 ? MAP1_START_POS : MAP2_START_POS;

  // Tipos: una posición es un par [row, col]
  type Pos = [number, number];

  const [beePosition, setBeePosition] = useState<Pos>(currentStartPos as Pos);
  const [visitedPath, setVisitedPath] = useState<Pos[]>([currentStartPos as Pos]); // Guarda las celdas visitadas para el rastro
  const [isGoalReached, setIsGoalReached] = useState<boolean>(false); // Para saber si llegó a la flor
  // Vallas entre celdas por mapa. Cada entrada es una key canonical "r1,c1-r2,c2" (orden independiente)
  // Inicializar por mapa permite tener vallas diferentes en cada mapa.
  const defaultFencesByMap: Record<number, Set<string>> = {
    0: new Set<string>([
      // Ejemplos para mapa 0
      '1,2-2,2',
      '1,3-2,3',
      '1,4-2,4',
    ]),
    1: new Set<string>([
      '1,4-1,5',
      '1,4-2,4',
      '1,2-2,2',
      '2,1-2,2',
      '2,2-2,3',
      '2,3-3,3',
      '2,4-3,4',
      '3,1-4,1',
      '3,2-3,3',
      '3,4-3,5',
      '4,1-4,2',
      '4,2-5,2',
      '4,3-4,4',
      '4,4-4,5',
      '5,1-5,2',
      '5,3-5,4',
      '6,2-7,2',
      '7,1-8,1'
    ]),
  };
  const [fencesByMap, setFencesByMap] = useState<Record<number, Set<string>>>(defaultFencesByMap);

  const fenceKey = (r1: number, c1: number, r2: number, c2: number) => {
    const a = `${r1},${c1}`;
    const b = `${r2},${c2}`;
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  };

  const hasFenceBetween = (r1: number, c1: number, r2: number, c2: number) => {
    const key = fenceKey(r1, c1, r2, c2);
    const setForMap = fencesByMap[currentMapIndex] ?? new Set<string>();
    return setForMap.has(key);
  };

  const toggleFenceBetweenCells = (r1: number, c1: number, r2: number, c2: number) => {
    const key = fenceKey(r1, c1, r2, c2);
    setFencesByMap(prev => {
      const next = { ...prev } as Record<number, Set<string>>;
      const setForMap = new Set(next[currentMapIndex] ?? []);
      if (setForMap.has(key)) setForMap.delete(key);
      else setForMap.add(key);
      next[currentMapIndex] = setForMap;
      return next;
    });
  };
  // Nota: no exponemos UI para colocar vallas; las vallas vienen del mapeo.
  // Rotación de la abeja en grados (0=up,90=right,180=down,270=left)
  // Estado inicial: 90° a la derecha
  const [beeRotation, setBeeRotation] = useState<number>(0);
  // Contador de pasos
  const [stepCount, setStepCount] = useState<number>(0);
  // Estado de ejecución (start/pause)
  const [isRunning, setIsRunning] = useState<boolean>(false);
  // Bluetooth state
  const [btEnabled, setBtEnabled] = useState<boolean>(false);
  const [btConnected, setBtConnected] = useState<boolean>(false);
  const [btDeviceName, setBtDeviceName] = useState<string | null>(null);
  const [pairedDevices, setPairedDevices] = useState<Array<any>>([]);
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [btDeviceId, setBtDeviceId] = useState<string | null>(null);
  // Playback (reproducir trazado) state
  type Action = { pos: Pos; rot: number };
  const [actionLog, setActionLog] = useState<Action[]>([{ pos: currentStartPos as Pos, rot: 0 }]);
  const [recordedPath, setRecordedPath] = useState<Action[] | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = React.useRef<any>(null);
  const playbackTimerRef = React.useRef<any>(null);

  const requestBluetoothPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        // Para Android 12 (API 31) y superior
        if (Platform.Version >= 31) {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          if (
            granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
            granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
            granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
          ) {
            console.log('Permisos de Bluetooth (Android 12+) concedidos');
            return true;
          } else {
            console.log('Permisos de Bluetooth (Android 12+) denegados');
            Alert.alert('Permiso denegado', 'Se necesitan permisos de Bluetooth para conectar dispositivos.');
            return false;
          }
        }
        // Para Android 11 (API 30) e inferior
        else {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Permiso de Ubicación',
              message: 'La app necesita acceso a la ubicación para buscar dispositivos Bluetooth.',
              buttonPositive: 'Aceptar',
            },
          );
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log('Permiso de Ubicación (Android < 12) concedido');
            return true;
          } else {
            console.log('Permiso de Ubicación (Android < 12) denegado');
            Alert.alert('Permiso denegado', 'Se necesita permiso de ubicación para buscar dispositivos Bluetooth.');
            return false;
          }
        }
      } catch (err) {
        console.warn('Error en requestBluetoothPermissions:', err);
        return false;
      }
    }
    return true; // No es Android, asumimos que está bien (o se maneja iOS)
  };

  // Efecto para resetear cuando cambia el mapa
  useEffect(() => {
    resetGame();
  }, [currentMapIndex]);

  // Limpieza de timers al desmontar
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, []);

  // Inicializar estado Bluetooth al montar
  useEffect(() => {
    let mounted = true;
    (async () => {
      const hasPermission = await requestBluetoothPermissions();
      if (!hasPermission || !mounted) return;

      try {
        const enabled = await BluetoothSerial.isBluetoothEnabled();
        const connectedDevice = await BluetoothSerial.getConnectedDevice('id');
        const connected = !!connectedDevice;
        if (!mounted) return;
        setBtEnabled(!!enabled);
        setBtConnected(!!connected);
        if (connected) {
          // intentar obtener nombre del dispositivo conectado
          try {
            const connectedDevice = await BluetoothSerial.getConnectedDevice('id');
            const name = connectedDevice ? connectedDevice.name : null;
            setBtDeviceName(name || null);
          } catch (_) {
            // ignore
          }
        }
      } catch (err) {
        console.log('BT init error', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Borra el avance (rastro) sin mover la abeja de su posición actual
  const clearProgress = () => {
    // Según la especificación: regresar a la posición inicial y borrar trazado
    resetGame();
    // además detener cualquier reproducción en curso
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
    if (playbackTimerRef.current) { clearInterval(playbackTimerRef.current); playbackTimerRef.current = null; }
    setRecordedPath(null);
    setPlaybackIndex(0);
    setCountdown(null);
    setIsPlaying(false);
    setIsRunning(false);
    // Enviar señal BT para clear (X)
    sendBtCommand('X');
  };

  const stopPlayback = () => {
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
    if (playbackTimerRef.current) { clearInterval(playbackTimerRef.current); playbackTimerRef.current = null; }
    setIsPlaying(false);
    setIsRunning(false);
    setCountdown(null);
    setRecordedPath(null);
    setPlaybackIndex(0);
  };

  const pausePlayback = () => {
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; setCountdown(null); }
    if (playbackTimerRef.current) { clearInterval(playbackTimerRef.current); playbackTimerRef.current = null; }
    setIsPlaying(false);
    setIsRunning(false);
    // Enviar señal BT para pausa
    sendBtCommand('P');
  };

  const resumePlayback = () => {
    // Si no está en modo "pausado" (no está sonando, pero hay un camino grabado), no hacer nada
    if (isPlaying || !recordedPath) {
      return;
    }

    setIsPlaying(true);
    setIsRunning(true);
    // Asumimos que 'G' (Go) también sirve para reanudar en el Arduino
    sendBtCommand('G');

    // El índice desde el cual continuar es el *siguiente* al que se pausó
    let idx = playbackIndex + 1;
    const path = recordedPath; // Usar el camino que ya estaba grabado

    // Iniciar el temporizador de reproducción inmediatamente (sin cuenta regresiva)
    playbackTimerRef.current = setInterval(() => {
      if (!path || idx >= path.length) {
        // Terminado
        if (playbackTimerRef.current) { clearInterval(playbackTimerRef.current); playbackTimerRef.current = null; }
        setIsPlaying(false);
        setIsRunning(false);
        setRecordedPath(null);
        setPlaybackIndex(0);
        return;
      }
      // Mover abeja al siguiente (pos + rot)
      const entry = path[idx];
      setBeePosition(entry.pos);
      setBeeRotation(entry.rot ?? 0);
      setVisitedPath(prev => [...prev, entry.pos]);
      setStepCount(s => s + 1);
      setPlaybackIndex(idx);
      idx += 1;
    }, 1000); // Mismo intervalo de 500ms
  };

  const togglePauseResume = () => {
    if (isPlaying) {
      // Está sonando -> Pausar
      pausePlayback();
    } else if (!isPlaying && recordedPath) {
      // Está pausado -> Reanudar
      resumePlayback();
    }
    // Si no está sonando y no hay camino, no hace nada
  };

  const startPlayback = () => {
    // If there's no recorded actions (only initial pos), nothing to play
    if (!actionLog || actionLog.length <= 1) {
      Alert.alert('Nada que reproducir', 'No has trazado un camino aún.');
      return;
    }
    // Freeze the recorded action log
    const path = [...actionLog];
    // Reiniciar contador para numerar pasos durante la reproducción
    setStepCount(0);
    setRecordedPath(path);
    // Countdown 3..1
    let c = 3;
    setCountdown(c);
    countdownTimerRef.current = setInterval(() => {
      c -= 1;
      setCountdown(c > 0 ? c : 0);
      if (c <= 0) {
        // start playback
        if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
        setCountdown(null);
        setIsPlaying(true);
        setIsRunning(true);
        // Reset visitedPath to show the replay trace from start
        // Asegurarse de posicionar la abeja en la posición inicial para que se vea la transición
        setBeePosition(path[0].pos);
        setVisitedPath([path[0].pos]);
        setBeeRotation(path[0].rot ?? 0);
        // Mostrar el estado inicial como paso 1
        setStepCount(1);
        setPlaybackIndex(0);
        // Enviar señal BT para inicio de reproducción (GO)
        sendBtCommand('G');
        let idx = 1;
        // Esperar 500ms mostrando el estado inicial antes de avanzar al siguiente paso
        setTimeout(() => {
          playbackTimerRef.current = setInterval(() => {
            if (!path || idx >= path.length) {
              // finished
              if (playbackTimerRef.current) { clearInterval(playbackTimerRef.current); playbackTimerRef.current = null; }
              setIsPlaying(false);
              setIsRunning(false);
              setRecordedPath(null);
              setPlaybackIndex(0);
              return;
            }
            // move bee to next (pos + rot)
            const entry = path[idx];
            setBeePosition(entry.pos);
            setBeeRotation(entry.rot ?? 0);
            setVisitedPath(prev => [...prev, entry.pos]);
            setStepCount(s => s + 1);
            setPlaybackIndex(idx);
            idx += 1;
          }, 500);
        }, 500);
      }
    }, 1000);
  };

  // Bluetooth helpers
  const connectToDevice = async (deviceId?: string) => {
    const hasPermission = await requestBluetoothPermissions();
    if (!hasPermission) return;

    setIsModalVisible(false);

    try {
      const enabled = await BluetoothSerial.isBluetoothEnabled();
      setBtEnabled(!!enabled);
      if (!enabled) {
        Alert.alert('Bluetooth desactivado', 'Activa el Bluetooth en tu dispositivo y vuelve a intentar.');
        return;
      }
      // Obtener lista de emparejados y decidir dispositivo a conectar
      const paired = await BluetoothSerial.getBondedDevices();
      const hc05 = deviceId ? paired.find((d: any) => d.id === deviceId || d.name === deviceId) : paired.find((d: any) => /hc-?05/i.test(d.name || ''));
      // Guardar la lista para mostrar al usuario si lo desea
      setPairedDevices(paired || []);
      if (!hc05) {
        Alert.alert('Dispositivo no encontrado', 'No se encontró un HC-05 emparejado. Empareja el módulo primero.');
        return;
      }
      await BluetoothSerial.connectToDevice(hc05.id);
      setBtConnected(true);
      setBtDeviceName(hc05.name || hc05.id);
      setBtDeviceId(hc05.id);
      Alert.alert('Bluetooth', `Conectado a ${hc05.name || hc05.id}`);
    } catch (err: any) {
      console.log('BT connect error', err);
      Alert.alert('Error BT', err.message || String(err));
    }
  };

  const refreshPairedDevices = async () => {
    const hasPermission = await requestBluetoothPermissions();
    if (!hasPermission) return;

    try {
      const list = await BluetoothSerial.getBondedDevices();
      setPairedDevices(list || []);
      if (!list || list.length === 0) {
        Alert.alert('Sin emparejados', 'No hay dispositivos emparejados o no se pudo leer la lista.');
      } else {
        setIsModalVisible(true);
      }
    } catch (err: any) {
      console.log('BT list error', err);
      Alert.alert('Error BT', err.message || String(err));
    }
  };

  const disconnectFromDevice = async () => {
    setIsModalVisible(false);
    try {
      await BluetoothSerial.disconnectFromDevice(btDeviceName || '');
      setBtConnected(false);
      setBtDeviceName(null);
      setBtDeviceId(null);
    } catch (err: any) {
      console.log('BT disconnect error', err);
      Alert.alert('Error BT', err.message || String(err));
    }
  };

  const sendBtCommand = async (cmd: string) => {
    // Solo enviar si hay conexión
    if (!btConnected || !btDeviceId) {
      // No queremos mostrar alerta por cada movimiento si no hay conexión, solo loguear
      console.log('BT not connected, skipping send:', cmd);
      return;
    }
    try {
      // Escribir como string simple. Algunos HC-05 esperan newline, depende del firmware.
      await BluetoothSerial.writeToDevice(btDeviceId, cmd + '\n');
      console.log('BT sent:', cmd);
    } catch (err: any) {
      console.log('BT write error', err);
    }
  };

  // Función para resetear el juego
  const resetGame = () => {
    setBeePosition(currentStartPos as Pos);
    setVisitedPath([currentStartPos as Pos]); // La posición inicial ya está visitada
    setIsGoalReached(false);
    setBeeRotation(0); // reiniciar rotación
    setStepCount(0); // reiniciar contador de pasos
    setIsRunning(false); // pausar cualquier ejecución
    setActionLog([{ pos: currentStartPos as Pos, rot: 0 }]);
  };

  const rotateLeft = () => {
    sendBtCommand('L');

    setBeeRotation(prev => {
      const next = (prev - 90 + 360) % 360;
      setActionLog(a => [...a, { pos: beePosition, rot: next }]);
      return next;
    });
    setStepCount(s => s + 1);
  };

  const rotateRight = () => {
    sendBtCommand('R');

    setBeeRotation(prev => {
      const next = (prev + 90) % 360;
      setActionLog(a => [...a, { pos: beePosition, rot: next }]);
      return next;
    });
    setStepCount(s => s + 1);
  };

  // Función para manejar el movimiento de la abeja
  const moveBee = (dx: number, dy: number) => {
    if (isGoalReached) return; // No mover si ya se llegó al objetivo
    // No permitir mover manualmente mientras se esté reproduciendo (GO)
    if (isRunning) {
      Alert.alert('En reproducción', 'No puedes mover la abeja mientras se está reproduciendo el trazado.');
      return;
    }

    const [currentRow, currentCol] = beePosition;
    const newRow = currentRow + dy;
    const newCol = currentCol + dx;

    // Verificar límites del mapa
    if (newRow < 0 || newRow >= currentMapLayout.length ||
      newCol < 0 || newCol >= currentMapLayout[0].length) {
      Alert.alert("¡Fuera del mapa!", "No puedes moverte en esa dirección.");
      return;
    }

    // Obtener el tipo de la nueva celda
    const newCellType = currentMapLayout[newRow][newCol];

    // Verificar si hay una valla entre la celda actual y la nueva
    if (hasFenceBetween(currentRow, currentCol, newRow, newCol)) {
      Alert.alert("¡Valla!", "Hay una valla entre estas celdas.");
      return;
    }

    // Verificar si es un obstáculo
    if (newCellType === 'M' || newCellType === 'W' || newCellType === 'G' || newCellType === 'R' || newCellType === 'U') { // 'M' de muro, 'W' de agua, 'G' pasto inaccesible, R/U arbustos
      Alert.alert("¡Obstáculo!", "No puedes pasar por ahí.");
      return;
    }

    // Si es un movimiento válido:
    const newPos: Pos = [newRow, newCol];
    // // Enviar comando Bluetooth según la dirección del movimiento
    // let command = '';
    // if (dy === -1 && dx === 0) command = 'F'; // Adelante/up
    // else if (dy === 1 && dx === 0) command = 'B'; // Atrás/down
    // else if (dx === -1 && dy === 0) command = 'L'; // Izquierda
    // else if (dx === 1 && dy === 0) command = 'R'; // Derecha
    // if (command) sendBtCommand(command);

    setBeePosition(newPos);
    setVisitedPath(prevPath => [...prevPath, newPos]); // Añadir al rastro
    setActionLog(prev => [...prev, { pos: newPos, rot: beeRotation }]);
    setStepCount(prev => prev + 1);

    // Verificar si se llegó a la flor
    if (newCellType === 'F') {
      setIsGoalReached(true);
      Alert.alert("¡Felicidades!", "¡La abeja llegó a la flor!");
    }

    // TODO: Aquí enviarías la señal Bluetooth
    // let command = '';
    // if (dy === -1) command = 'F'; // Adelante
    // else if (dy === 1) command = 'B'; // Atrás
    // else if (dx === -1) command = 'L'; // Izquierda
    // else if (dx === 1) command = 'R'; // Derecha
    // BluetoothSerial.write(command)
    //   .then(() => console.log('Comando enviado:', command))
    //   .catch((err) => console.log('Error al enviar BT:', err.message));
  };

  // Mover según la orientación actual (mult = 1 forward, -1 backward)
  const moveInFacingDirection = (mult: number = 1) => {
    if (mult === 1) {
      sendBtCommand('F'); // O el comando para 'Avanzar'
    } else if (mult === -1) {
      sendBtCommand('B'); // O el comando para 'Retroceder'
    }

    const dirRaw = ((beeRotation % 360) + 360) % 360;
    const dir = Math.round(dirRaw / 90) * 90 % 360;
    let dx = 0;
    let dy = 0;
    switch (dir) {
      case 0: dy = -1; dx = 0; break; // up
      case 90: dx = 1; dy = 0; break; // right
      case 180: dy = 1; dx = 0; break; // down
      case 270: dx = -1; dy = 0; break; // left
      default: dy = -1; dx = 0; break;
    }
    moveBee(dx * mult, dy * mult);
  };

  // Función para renderizar una celda
  const renderCell = (cellType: string, row: number, col: number) => {
    const isBeeHere = beePosition[0] === row && beePosition[1] === col;
    const isVisited = visitedPath.some(pos => pos[0] === row && pos[1] === col);

    let cellStyle: ViewStyle | ViewStyle[] = styles.cell;
    let cellContent: React.ReactNode = null;

    switch (cellType) {
      case 'M':
        cellStyle = [styles.cell, styles.wallCell];
        break;
      case 'R':
        cellStyle = [styles.cell, styles.emptyCell];
        cellContent = (
          <>
            <Image source={GRASS_TILE_IMAGE} style={styles.grassTile} />
            <Image source={REDBUSH_IMAGE} style={styles.bushImage} />
          </>
        );
        break;
      case 'U':
        cellStyle = [styles.cell, styles.emptyCell];
        cellContent = (
          <>
            <Image source={GRASS_TILE_IMAGE} style={styles.grassTile} />
            <Image source={BLUEBUSH_IMAGE} style={styles.bushImage} />
          </>
        );
        break;
      case 'W':
        cellStyle = [styles.cell, styles.waterCell];
        // Mostrar imagen de agua
        cellContent = <Image source={WATER_IMAGE} style={styles.waterImage} />;
        break;
      case 'B':
        cellStyle = [styles.cell, styles.berriesCell];
        break;
      case 'F':
        // Mostrar pasto debajo de la flor
        cellContent = (
          <>
            <Image source={GRASS_IMAGE} style={styles.grassImage} />
            <Image source={FLOWER_IMAGE} style={styles.flowerImage} />
          </>
        );
        cellStyle = [styles.cell, styles.pathCell]; // La flor está en un camino
        break;
      case 'P':
      case 'X': // En el segundo mapa, 'X' es solo un camino vacío
        cellStyle = [styles.cell, styles.pathCell];
        // Mostrar pasto como asset en las celdas de camino
        cellContent = <Image source={GRASS_IMAGE} style={styles.grassImage} />;
        break;
      case 'G':
        cellStyle = [styles.cell, styles.emptyCell];
        cellContent = <Image source={GRASS_TILE_IMAGE} style={styles.grassTile} />;
        break;
      default:
        cellStyle = [styles.cell, styles.emptyCell]; // Para celdas no definidas, ej. arbustos
        // No mostrar pasto por defecto en muros u otros elementos
        cellContent = null;
        break;
    }

    // Si la celda está en el camino visitado y no es la posición actual de la abeja ni el objetivo
    if (isVisited && !isBeeHere && !(cellType === 'F' && isGoalReached)) {
      // Para mantener el tipado de estilos de React Native usamos un array y añadimos estilo inline para el rastro
      cellStyle = Array.isArray(cellStyle) ? [...cellStyle, { backgroundColor: 'rgba(0, 255, 0, 0.3)' }] : [cellStyle, { backgroundColor: 'rgba(0, 255, 0, 0.3)' }]; // Rastro verde semi-transparente
    }


    return (
      <View key={`${row}-${col}`} style={cellStyle}>
        {cellContent}
        {isBeeHere && (
          <Image
            source={BEE_IMAGE}
            style={[
              styles.beeImage,
              {
                transform: [
                  { translateX: -(CELL_SIZE * SPRITE_SCALE) / 2 },
                  { translateY: -(CELL_SIZE * SPRITE_SCALE) / 2 },
                  { rotate: `${beeRotation}deg` },
                ],
              },
            ]}
          />
        )}

        {/* Render vallas conectadas a esta celda (usando imágenes de assets) */}
        {hasFenceBetween(row, col, row - 1, col) && (
          <Image source={FENCE_T_IMAGE} style={[styles.fenceImage, styles.fenceHorizontalTop]} />
        )}
        {hasFenceBetween(row, col, row + 1, col) && (
          <Image source={FENCE_B_IMAGE} style={[styles.fenceImage, styles.fenceHorizontalBottom]} />
        )}
        {hasFenceBetween(row, col, row, col - 1) && (
          <Image source={FENCE_L_IMAGE} style={[styles.fenceImage, styles.fenceVerticalLeft]} />
        )}
        {hasFenceBetween(row, col, row, col + 1) && (
          <Image source={FENCE_R_IMAGE} style={[styles.fenceImage, styles.fenceVerticalRight]} />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Abeja en el Laberinto</Text>
      <Text style={styles.stepCounterTitle}>Pasos: {stepCount}</Text>
      <View style={styles.btRow}>
        <Text style={styles.btStatus}>{btConnected ? `BT: Conectado (${btDeviceName || 'HC-05'})` : `BT: ${btEnabled ? 'No conectado' : 'Desactivado'}`}</Text>
        <TouchableOpacity style={styles.btButton} onPress={() => connectToDevice()}>
          <Text style={styles.controlTextSmall}>Conectar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btButton} onPress={() => disconnectFromDevice()}>
          <Text style={styles.controlTextSmall}>Desconectar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btButton} onPress={() => refreshPairedDevices()}>
          <Text style={styles.controlTextSmall}>Buscar</Text>
        </TouchableOpacity>
      </View>
      {/* --- INICIA EL MODAL DE DISPOSITIVOS --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => {
          setIsModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Dispositivos Emparejados</Text>

            {/* Usamos ScrollView por si la lista es muy larga */}
            <ScrollView style={styles.pairedListContainer}>
              {pairedDevices && pairedDevices.length > 0 ? (
                pairedDevices.map((d: any) => (
                  <TouchableOpacity key={d.id} style={styles.pairedItem} onPress={() => connectToDevice(d.id)}>
                    <Text style={styles.pairedName}>{d.name || 'Dispositivo sin nombre'}</Text>
                    <Text style={styles.pairedId}>{d.id}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.pairedId}>No se encontraron dispositivos.</Text>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setIsModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* --- TERMINA EL MODAL --- */}


      <View style={styles.mapContainer}>
        {currentMapLayout.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((cellType, colIndex) => renderCell(cellType, rowIndex, colIndex))}
          </View>
        ))}
      </View>

      <View style={styles.controlsGrid}>
        <View style={styles.controlRowTop}>
          <TouchableOpacity style={{ ...styles.controlButtonLarge, backgroundColor: '#FFA500' }} onPress={() => moveInFacingDirection(1)}>
            <Text style={styles.controlText}>⬆️</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlRowMiddle}>
          <TouchableOpacity style={{ ...styles.controlButtonLarge, backgroundColor: '#FFA500' }} onPress={() => rotateLeft()}>
            <Text style={styles.controlText}>⬅️</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButtonGo} onPress={() => startPlayback()}>
            <Text style={styles.controlText}>{countdown && countdown > 0 ? `${countdown}` : 'GO'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ ...styles.controlButtonLarge, backgroundColor: '#FFA500' }} onPress={() => rotateRight()}>
            <Text style={styles.controlText}>➡️</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlRowBottom}>
          <TouchableOpacity style={{ ...styles.controlButtonSmall, backgroundColor: '#00AEEF' }} onPress={() => clearProgress()}>
            <Text style={styles.controlText}>✖️</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ ...styles.controlButtonLarge, backgroundColor: '#FFA500' }} onPress={() => moveInFacingDirection(-1)}>
            <Text style={styles.controlText}>⬇️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ ...styles.controlButtonSmall, backgroundColor: '#00AEEF' }}
            onPress={togglePauseResume}
          >
            {/* Si NO está sonando Y hay un camino grabado (es decir, está pausado), muestra 'Reanudar'. De lo contrario, muestra 'Pausa'. */}
            <Text style={styles.controlText}>{!isPlaying && recordedPath ? '▶️' : '⏸️'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.switchMapButton}
        onPress={() => setCurrentMapIndex(prev => (prev === 0 ? 1 : 0))}
      >
        <Text style={styles.switchMapText}>Cambiar al Mapa {currentMapIndex === 0 ? '2' : '1'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// --- ESTILOS ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 0.5,
    borderColor: '#ccc',
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  // Estilos para las vallas entre celdas
  fence: {
    position: 'absolute',
    backgroundColor: '#333',
    zIndex: 3,
  },

  // Imagen de valla
  fenceImage: {
    position: 'absolute',
    zIndex: 3,
    resizeMode: 'contain',
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  // Ajustes para que las imágenes de valla se posicionen correctamente
  fenceHorizontalTop: {
    top: -CELL_SIZE * 0.125,
    left: 0,
    right: 0,
    height: CELL_SIZE * 0.25,
  },
  fenceHorizontalBottom: {
    bottom: -CELL_SIZE * 0.125,
    left: 0,
    right: 0,
    height: CELL_SIZE * 0.25,
  },
  fenceVerticalLeft: {
    left: -CELL_SIZE * 0.06,
    top: 0,
    bottom: 0,
    width: CELL_SIZE * 0.12, // más delgada en X
    height: CELL_SIZE, // ocupar la altura completa para que se vea vertical
  },
  fenceVerticalRight: {
    right: -CELL_SIZE * 0.06,
    top: 0,
    bottom: 0,
    width: CELL_SIZE * 0.12,
    height: CELL_SIZE,
  },
  emptyCell: {
    backgroundColor: '#A0D28E', // Color de pasto claro
  },
  pathCell: {
    backgroundColor: '#D9EDCC', // Color de camino (pasto más claro)
  },
  wallCell: {
    backgroundColor: '#8B4513', // Marrón oscuro para los muros
  },
  waterCell: {
    backgroundColor: '#87CEEB', // Azul claro para el agua
  },
  berriesCell: {
    backgroundColor: '#8B4513', // Color de muro, pero podrías poner una imagen
    justifyContent: 'center',
    alignItems: 'center',
  },
  beeImage: {
    width: CELL_SIZE * SPRITE_SCALE,
    height: CELL_SIZE * SPRITE_SCALE,
    resizeMode: 'contain',
    position: 'absolute', // Para que se superponga
    zIndex: 2,
    top: '50%',
    left: '50%',
    // transform aplicado dinámicamente al render
  },
  flowerImage: {
    width: CELL_SIZE * SPRITE_SCALE,
    height: CELL_SIZE * SPRITE_SCALE,
    resizeMode: 'contain',
    position: 'absolute',
    zIndex: 2,
    top: '50%',
    left: '50%',
    transform: [{ translateX: -(CELL_SIZE * SPRITE_SCALE) / 2 }, { translateY: -(CELL_SIZE * SPRITE_SCALE) / 2 }],
  },
  grassImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CELL_SIZE,
    height: CELL_SIZE,
    resizeMode: 'cover',
    zIndex: 1,
  },
  grassTile: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CELL_SIZE,
    height: CELL_SIZE,
    resizeMode: 'cover',
    zIndex: 1,
  },
  bushImage: {
    width: CELL_SIZE * 0.9,
    height: CELL_SIZE * 0.9,
    resizeMode: 'contain',
    zIndex: 2,
  },
  waterImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CELL_SIZE,
    height: CELL_SIZE,
    resizeMode: 'cover',
    zIndex: 1,
  },
  controls: {
    alignItems: 'center',
    marginBottom: 20,
  },
  horizontalControls: {
    flexDirection: 'row',
    marginVertical: 10,
  },
  controlsGrid: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  controlRowTop: {
    marginBottom: 5,
  },
  controlRowMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 210,
    marginBottom: 5,
  },
  controlRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 210,
  },
  controlButtonLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonSmall: {
    width: 45,
    height: 45,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonGo: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colControl: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  colControlCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  stepCounterText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  stepCounterTitle: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '700',
  },
  controlButton: {
    backgroundColor: '#007BFF',
    padding: 15,
    borderRadius: 10,
    marginHorizontal: 5,
  },
  controlText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  switchMapButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  switchMapText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  mapContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  row: {
    flexDirection: 'row',
  },
  btRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  btStatus: {
    color: '#333',
    marginRight: 10,
    fontWeight: '600',
  },
  btButton: {
    backgroundColor: '#007BFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginHorizontal: 6,
  },
  controlTextSmall: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  pairedItem: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  pairedName: {
    fontWeight: '700',
    color: '#333',
  },
  pairedId: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Fondo semi-transparente
  },
  modalView: {
    width: '90%',
    maxHeight: '70%',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  pairedListContainer: {
    width: '100%', // Ocupa todo el ancho del modal
    marginBottom: 15,
  },
  modalCloseButton: {
    backgroundColor: '#d9534f', // Un color rojo para cerrar
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    elevation: 2,
  },
  modalCloseText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
});