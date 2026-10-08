import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";

export default function Feedback() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    role: "",
    easyToUse: "",
    clearInfo: "",
    noHelp: "",
    saveTime: "",
    loginIssues: "",
    uploadIssues: "",
    likes: "",
    improvements: "",
    rating: "",
    recommend: "",
  });

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isFormComplete = Object.values(formData).every((val) => val.trim() !== "");

  const handleContinue = () => {
    if (user?.email) {
      localStorage.setItem(`dgc-feedback-seen-${user.email}`, "true");
    }
    navigate("/", { replace: true });
  };

  const handleSubmit = () => {
    if (!isFormComplete) {
      alert("Por favor, responde a todas las preguntas antes de enviar.");
      return;
    }
    setIsSubmitting(true);
  };

  const handleIframeLoad = () => {
    if (isSubmitting) {
      setIsSubmitted(true);
      setIsSubmitting(false);
      if (user?.email) {
        localStorage.setItem(`dgc-feedback-seen-${user.email}`, "true");
      }
    }
  };

  const formActionUrl =
    "https://docs.google.com/forms/d/e/1FAIpQLScMyqJ5v3LFjN4RTvhgWjN4xepSF5MeaJaJd6K9o8Fzh3jk6Q/formResponse";

  const renderRadioGroup = (field, entryName, options) => {
    return (
      <div className="flex flex-wrap gap-3">
        {options.map((opt) => (
          <label
            key={opt}
            className={`flex-1 min-w-[120px] flex items-center justify-center py-2.5 px-4 rounded-xl border text-sm font-medium cursor-pointer transition-all duration-200 select-none ${
              formData[field] === opt
                ? "border-primary bg-primary/5 text-primary font-semibold"
                : "border-border hover:bg-slate-50 text-slate-600"
            }`}
          >
            <input
              type="radio"
              name={entryName}
              value={opt}
              checked={formData[field] === opt}
              onChange={() => handleFieldChange(field, opt)}
              className="sr-only"
              required
            />
            {opt}
          </label>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 font-inter">
      <form
        action={formActionUrl}
        method="POST"
        target="hidden_iframe"
        onSubmit={handleSubmit}
        className="w-full max-w-3xl border-0 shadow-lg bg-card rounded-2xl overflow-hidden flex flex-col h-[90vh] sm:h-[85vh]"
      >
        <CardHeader className="bg-primary text-primary-foreground p-6 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
              Evaluación de la aplicación Control de Obras DGC
            </CardTitle>
            <CardDescription className="text-primary-foreground/80 text-xs sm:text-sm">
              Esta encuesta es confidencial y demora aproximadamente 2 minutos. Su opinión nos ayuda a mejorar.
              {user?.email && (
                <span className="block mt-1 font-semibold text-accent">
                  Usuario registrado: {user.email}
                </span>
              )}
            </CardDescription>
          </div>
          {isSubmitted && (
            <Button
              type="button"
              onClick={handleContinue}
              className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 shrink-0 font-semibold px-6 shadow-sm h-11"
            >
              Continuar a la aplicación
            </Button>
          )}
        </CardHeader>

        <CardContent className="flex-1 p-6 overflow-y-auto bg-white relative">
          {isSubmitted ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 animate-in zoom-in duration-300" />
              <h3 className="text-2xl font-bold text-slate-800">¡Muchas gracias por tus respuestas!</h3>
              <p className="text-sm text-slate-500 max-w-md">
                Tu opinión ha sido registrada exitosamente. Ya puedes presionar el botón de continuar para ingresar al Dashboard.
              </p>
              <Button
                type="button"
                onClick={handleContinue}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 h-11 shadow-md"
              >
                Ingresar ahora
              </Button>
            </div>
          ) : (
            <div className="space-y-6 max-w-2xl mx-auto pb-8">
              {/* Question 1 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  1. ¿Qué rol cumples en la obra? <span className="text-red-500">*</span>
                </Label>
                {renderRadioGroup("role", "entry.499182885", ["Supervisor", "Capataz"])}
              </div>

              {/* Question 2 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  2. ¿La aplicación es fácil de utilizar? <span className="text-red-500">*</span>
                </Label>
                {renderRadioGroup("easyToUse", "entry.319067516", ["Sí", "No"])}
              </div>

              {/* Question 3 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  3. ¿La información mostrada es clara y suficiente para realizar tu trabajo? <span className="text-red-500">*</span>
                </Label>
                {renderRadioGroup("clearInfo", "entry.140886988", ["Sí", "No"])}
              </div>

              {/* Question 4 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  4. ¿Puedes registrar las actividades sin ayuda? <span className="text-red-500">*</span>
                </Label>
                {renderRadioGroup("noHelp", "entry.378591485", ["Sí", "No"])}
              </div>

              {/* Question 5 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  5. ¿La aplicación te ayuda a ahorrar tiempo? <span className="text-red-500">*</span>
                </Label>
                {renderRadioGroup("saveTime", "entry.1242083270", ["Sí", "No"])}
              </div>

              {/* Question 6 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  6. ¿Has tenido problemas para iniciar sesión? <span className="text-red-500">*</span>
                </Label>
                {renderRadioGroup("loginIssues", "entry.830425930", ["Sí", "No"])}
              </div>

              {/* Question 7 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  7. ¿Has tenido problemas al cargar fotografías, firmas o registros? <span className="text-red-500">*</span>
                </Label>
                {renderRadioGroup("uploadIssues", "entry.1816008037", ["Sí", "No", "No he utilizado esa función"])}
              </div>

              {/* Question 8 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  8. ¿Qué fue lo que más te gustó de la aplicación? <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  name="entry.2046221698"
                  placeholder="Escribe tu respuesta aquí..."
                  value={formData.likes}
                  onChange={(e) => handleFieldChange("likes", e.target.value)}
                  className="min-h-[80px]"
                  required
                />
              </div>

              {/* Question 9 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  9. ¿Qué mejorarías o qué función agregarías? <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  name="entry.1848793937"
                  placeholder="Escribe tu respuesta aquí..."
                  value={formData.improvements}
                  onChange={(e) => handleFieldChange("improvements", e.target.value)}
                  className="min-h-[80px]"
                  required
                />
              </div>

              {/* Question 10 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  10. En general, ¿cómo calificarías la aplicación? <span className="text-red-500">*</span>
                </Label>
                <div className="flex justify-between gap-2 max-w-md mx-auto pt-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <label
                      key={num}
                      className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center font-bold text-sm cursor-pointer transition-all duration-200 select-none ${
                        formData.rating === String(num)
                          ? "border-primary bg-primary text-primary-foreground shadow-md"
                          : "border-border hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="entry.1082126008"
                        value={num}
                        checked={formData.rating === String(num)}
                        onChange={() => handleFieldChange("rating", String(num))}
                        className="sr-only"
                        required
                      />
                      {num}
                    </label>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs text-slate-400 max-w-md mx-auto px-1">
                  <span>Muy mala</span>
                  <span>Excelente</span>
                </div>
              </div>

              {/* Question 11 */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  11. ¿Recomendarías utilizar esta aplicación en otras obras? <span className="text-red-500">*</span>
                </Label>
                {renderRadioGroup("recommend", "entry.1870808054", ["Sí", "No"])}
              </div>

              {/* Submit button */}
              <div className="pt-4 border-t flex justify-end">
                <Button
                  type="submit"
                  disabled={!isFormComplete || isSubmitting}
                  className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 h-11"
                >
                  {isSubmitting ? "Enviando..." : "Enviar Formulario"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </form>
      <iframe
        name="hidden_iframe"
        id="hidden_iframe"
        style={{ display: "none" }}
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
