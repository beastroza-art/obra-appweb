import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

/**
 * VoiceInputButton
 * Dictado por voz en tiempo real con:
 * - Detección de volumen en vivo (para comprobar si el micrófono del equipo realmente recibe sonido)
 * - Compatibilidad multi-idioma (es-419 / es-CL / es-ES)
 * - Auto-recuperación y diagnósticos claros de errores
 */
export function VoiceInputButton({
  value = "",
  onChange,
  className = "",
  disabled = false,
  lang = "es-419", // Español Latinoamericano universal (más compatible que es-CL en desktop)
  title = "Dictar por voz",
}) {
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0 a 100
  const [isSupported, setIsSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  const recognitionRef = useRef(null);
  const initialValueRef = useRef("");
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const shouldContinueRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setIsSupported(false);
    }

    return () => {
      cleanupAudio();
      stopRecognition();
    };
  }, []);

  const cleanupAudio = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      streamRef.current = null;
    }
    setAudioLevel(0);
  };

  const stopRecognition = () => {
    shouldContinueRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    cleanupAudio();
    setIsListening(false);
  };

  // Iniciar medidor de volumen en vivo para verificar que el micrófono físico responde
  const startAudioMeter = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.5;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkLevel = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        // Normalizar 0 a 100
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);

        animFrameRef.current = requestAnimationFrame(checkLevel);
      };

      checkLevel();
    } catch (err) {
      console.warn("No se pudo iniciar el medidor de volumen del micro:", err);
    }
  };

  const startListening = async () => {
    if (disabled) return;
    setErrorMessage(null);

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      toast({
        title: "Navegador no compatible",
        description:
          "El dictado por voz requiere Google Chrome, Microsoft Edge o Safari.",
        variant: "destructive",
      });
      return;
    }

    try {
      // 1. Iniciar medidor de audio físico
      await startAudioMeter();

      // 2. Configurar SpeechRecognition
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang; // Por defecto 'es-419' (español latinoamericano)
      recognition.maxAlternatives = 1;

      initialValueRef.current = value || "";
      shouldContinueRef.current = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        const spoken = (
          finalTranscript +
          (interimTranscript ? " " + interimTranscript : "")
        ).trim();

        if (spoken && onChange) {
          const base = initialValueRef.current.trim();
          let separator = " ";
          if (base && !/[.!?,\n]$/.test(base)) {
            separator = ". ";
          }
          const fullText = base ? `${base}${separator}${spoken}` : spoken;
          onChange(fullText);
        }
      };

      recognition.onerror = (event) => {
        console.warn("Error en SpeechRecognition:", event.error);

        if (event.error === "not-allowed" || event.error === "permission-denied") {
          setErrorMessage("Permiso denegado en el navegador.");
          toast({
            title: "Micrófono bloqueado",
            description:
              "Autoriza el acceso al micrófono en el ícono de candado junto a la URL del navegador.",
            variant: "destructive",
          });
          stopRecognition();
        } else if (event.error === "audio-capture") {
          setErrorMessage("Sin micrófono detectado.");
          toast({
            title: "Error de captura de audio",
            description:
              "No se detecta entrada de sonido. Revisa que tu micrófono esté conectado y no esté silenciado.",
            variant: "destructive",
          });
          stopRecognition();
        } else if (event.error === "network") {
          setErrorMessage("Falla de red en servidor de voz.");
          toast({
            title: "Error de conexión de voz",
            description:
              "El servicio de voz de Google no respondió. Revisa tu conexión a internet.",
            variant: "destructive",
          });
          stopRecognition();
        } else if (event.error === "no-speech") {
          // Si no detectó voz, no paramos abruptamente, dejamos que el usuario siga hablando si quiere
          console.log("No speech detected yet...");
        }
      };

      recognition.onend = () => {
        // Si el usuario no presionó parar y el navegador se cerró por timeout de silencio,
        // podemos reiniciar si sigue activo
        if (shouldContinueRef.current) {
          try {
            recognition.start();
          } catch {
            setIsListening(false);
            cleanupAudio();
          }
        } else {
          setIsListening(false);
          cleanupAudio();
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Error al iniciar reconocimiento de voz:", err);
      setErrorMessage("No se pudo iniciar.");
      stopRecognition();
    }
  };

  const toggleListening = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isListening) {
      stopRecognition();
    } else {
      startListening();
    }
  };

  if (!isSupported) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] text-slate-400 cursor-not-allowed ${className}`}
        title="Dictado no soportado en este navegador (usa Chrome o Edge)"
      >
        <AlertCircle className="h-3 w-3" />
        <span className="hidden sm:inline">Voz no soportada</span>
      </span>
    );
  }

  if (isListening) {
    // Calculamos si hay sonido físico llegando al micro (barras activas)
    const hasSound = audioLevel > 8;

    return (
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleListening}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-rose-700 bg-rose-100 border border-rose-300 hover:bg-rose-200 transition-all cursor-pointer shadow-xs ${className}`}
          title="Toca para terminar el dictado"
        >
          {/* Indicador de volumen físico */}
          <span className="flex items-end gap-0.5 h-3 w-3.5 px-0.5">
            <span
              className="w-1 bg-rose-600 rounded-full transition-all duration-75"
              style={{ height: `${Math.max(20, Math.min(100, audioLevel * 1.5))}%` }}
            />
            <span
              className="w-1 bg-rose-600 rounded-full transition-all duration-75"
              style={{ height: `${Math.max(30, Math.min(100, audioLevel * 2))}%` }}
            />
            <span
              className="w-1 bg-rose-600 rounded-full transition-all duration-75"
              style={{ height: `${Math.max(20, Math.min(100, audioLevel * 1.2))}%` }}
            />
          </span>

          <MicOff className="h-3 w-3 text-rose-600" />
          <span>
            {hasSound ? "Escuchando voz..." : "Habla al micrófono..."}
          </span>
          <span className="text-[10px] text-rose-500 font-normal">
            (Detener)
          </span>
        </button>

        {/* Alerta visible si no le llega sonido al micrófono de la laptop */}
        {!hasSound && (
          <span
            className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 animate-pulse hidden sm:inline"
            title="Si hablas y estas barras no suben, tu micrófono de Windows está silenciado o en volumen 0"
          >
            ¿Micrófono en silencio?
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggleListening}
        disabled={disabled}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 border border-slate-200 transition-colors cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        title={title}
      >
        <Mic className="h-3 w-3 text-rose-500" />
        <span>Dictar</span>
      </button>

      {errorMessage && (
        <span
          className="text-[10px] text-rose-600 font-medium"
          title={errorMessage}
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
}

export default VoiceInputButton;
