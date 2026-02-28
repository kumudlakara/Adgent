import { useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Upload, Sparkles, X, ImagePlus, ArrowRight } from "lucide-react";
import { EPhotoMakerEnum, Runware } from "@runware/sdk-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const sanitizeEnvValue = (value?: string) =>
  (value || "").trim().replace(/^['"]|['"]$/g, "");

const runwareApiKey = sanitizeEnvValue(import.meta.env.VITE_RUNWARE_API_KEY);
const configuredRunwareImageModel = sanitizeEnvValue(
  import.meta.env.VITE_RUNWARE_IMAGE_MODEL,
);
const defaultRunwareImageModel = "runware:100@1";

/* ── Singleton Runware connection ────────────────────────────── */
type RunwareInstance = InstanceType<typeof Runware>;
let runwareInstance: RunwareInstance | null = null;
let runwareConnecting: Promise<RunwareInstance> | null = null;

async function getRunware(): Promise<RunwareInstance> {
  if (runwareInstance) return runwareInstance;

  // If already connecting, wait for the existing attempt
  if (runwareConnecting) return runwareConnecting;

  runwareConnecting = (async () => {
    try {
      // Disconnect stale instance if any
      try {
        runwareInstance?.disconnect?.();
      } catch {
        /* ignore */
      }

      const instance = new Runware({ apiKey: runwareApiKey });

      // Give the WebSocket time to connect & authenticate.
      // imageInference / photoMaker call ensureConnection() internally,
      // but a short upfront wait avoids repeated internal retries.
      await new Promise((r) => setTimeout(r, 2_000));

      runwareInstance = instance;
      return instance;
    } finally {
      runwareConnecting = null;
    }
  })();

  return runwareConnecting;
}

const getRunwareErrorMessage = (error: unknown) => {
  if (error && typeof error === "object") {
    const err = error as {
      message?: unknown;
      error?: {
        message?: unknown;
      };
    };

    if (err.error?.message) return String(err.error.message);
    if (err.message) return String(err.message);
  }

  if (typeof error === "string") return error;
  return "Unknown Runware error";
};

export default function CampaignCreate() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get("mode") || "generate";

  const [uploadedAd, setUploadedAd] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [adName, setAdName] = useState("");
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  type DropSetter =
    | React.Dispatch<React.SetStateAction<string | null>>
    | React.Dispatch<React.SetStateAction<string[]>>;

  const handleFileDrop = useCallback(
    (setter: DropSetter, multiple = false) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        Array.from(files).forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (multiple) {
              (setter as React.Dispatch<React.SetStateAction<string[]>>)(
                (prev) => [...prev, reader.result as string],
              );
            } else {
              (setter as React.Dispatch<React.SetStateAction<string | null>>)(
                reader.result as string,
              );
            }
          };
          reader.readAsDataURL(file);
        });
      },
    [],
  );

  const handleGenerate = async () => {
    if (!runwareApiKey) {
      toast.error("Runware API key missing", {
        description: "Add VITE_RUNWARE_API_KEY in your .env file.",
      });
      return;
    }

    const trimmedPrompt = prompt.trim();
    const trimmedAdName = adName.trim();

    if (!trimmedPrompt && !trimmedAdName) {
      toast.error("Please provide campaign input", {
        description: "Add a campaign name or ad description before generating.",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const runware = await getRunware();
      const preferredModel =
        configuredRunwareImageModel || defaultRunwareImageModel;

      const positivePrompt = [
        trimmedAdName ? `Campaign Name: ${trimmedAdName}` : "",
        trimmedPrompt,
      ]
        .filter(Boolean)
        .join("\n");

      const generateWithModel = async (model: string) => {
        // Wrap in a 90-second overall timeout
        const timeoutMs = 90_000;
        const result = await Promise.race([
          (async () => {
            if (productImages.length > 0) {
              const res = await runware.photoMaker({
                style: EPhotoMakerEnum.Photographic,
                inputImages: productImages,
                positivePrompt,
                model,
                width: 1280,
                height: 720,
                numberResults: 1,
                outputType: "URL",
              });
              return res?.[0]?.imageURL;
            }

            const res = await runware.imageInference({
              positivePrompt,
              model,
              width: 1280,
              height: 720,
              numberResults: 1,
              outputType: "URL",
            });

            return res?.[0]?.imageURL;
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Image generation timed out after 90 s")),
              timeoutMs,
            ),
          ),
        ]);

        return result;
      };

      let generatedImage: string | undefined;

      try {
        generatedImage = await generateWithModel(preferredModel);
      } catch (modelError) {
        if (preferredModel !== defaultRunwareImageModel) {
          console.warn(
            `Runware model '${preferredModel}' failed. Retrying with '${defaultRunwareImageModel}'.`,
            modelError,
          );
          generatedImage = await generateWithModel(defaultRunwareImageModel);
          toast.info("Falling back to default image model", {
            description: `Configured model '${preferredModel}' failed.`,
          });
        } else {
          throw modelError;
        }
      }

      if (!generatedImage) {
        throw new Error("No image returned from Runware");
      }

      setGeneratedPreview(generatedImage);
      toast.success("Ad generated successfully");
    } catch (error) {
      // Invalidate the singleton so the next attempt reconnects cleanly
      try {
        runwareInstance?.disconnect?.();
      } catch {
        /* ignore */
      }
      runwareInstance = null;

      const errorMessage = getRunwareErrorMessage(error);
      console.error("Runware generation error", error);
      toast.error("Failed to generate ad", {
        description: `${errorMessage}. If you just changed .env, restart the Vite dev server.`,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleContinue = () => {
    const image = generatedPreview || uploadedAd || null;
    if (image) {
      sessionStorage.setItem("adgent_thumbnail", image);
    } else {
      sessionStorage.removeItem("adgent_thumbnail");
    }
    navigate("/campaign/target");
  };

  if (mode === "upload") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">
            Upload Your Ad
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload the creative for your campaign.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="ad-name">Campaign Name</Label>
            <Input
              id="ad-name"
              placeholder="e.g. Summer Sale Banner"
              value={adName}
              onChange={(e) => setAdName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {!uploadedAd ? (
            <label className="flex flex-col items-center justify-center gap-3 p-12 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
              <Upload className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Drop your ad image here
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, GIF up to 10MB
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileDrop(setUploadedAd)}
              />
            </label>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-border">
              <img
                src={uploadedAd}
                alt="Uploaded ad"
                className="w-full max-h-96 object-contain bg-card"
              />
              <button
                onClick={() => setUploadedAd(null)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleContinue}
            disabled={!uploadedAd}
            className="gap-1"
          >
            Continue to Targeting <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Generate mode
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif text-foreground">
          Generate Your Ad
        </h1>
        <p className="text-muted-foreground mt-1">
          Describe your ad and let AI create it.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: inputs */}
        <div className="space-y-5">
          <div>
            <Label htmlFor="campaign-name">Campaign Name</Label>
            <Input
              id="campaign-name"
              placeholder="e.g. Summer Sale Banner"
              value={adName}
              onChange={(e) => setAdName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Product images */}
          <div>
            <Label>Product Images (optional)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Upload reference images of your product.
            </p>
            <div className="flex flex-wrap gap-3">
              {productImages.map((img, i) => (
                <div
                  key={i}
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-border"
                >
                  <img
                    src={img}
                    alt={`Product ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() =>
                      setProductImages((prev) =>
                        prev.filter((_, idx) => idx !== i),
                      )
                    }
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-foreground/80 text-background"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <label className="flex items-center justify-center w-20 h-20 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <ImagePlus className="w-5 h-5 text-muted-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileDrop(setProductImages, true)}
                />
              </label>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <Label htmlFor="prompt">Ad Description & Style</Label>
            <Textarea
              id="prompt"
              placeholder="Describe what your ad should look like. Include details about colors, style, text, mood, target audience, font preferences, etc."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="mt-1.5 min-h-[140px]"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full gap-2"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Generate Ad
              </>
            )}
          </Button>
        </div>

        {/* Right: preview */}
        <Card className="border-border">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-foreground mb-3">Preview</p>
            {generatedPreview ? (
              <div className="space-y-4">
                <div className="w-full aspect-video rounded-lg overflow-hidden border border-border bg-card">
                  <img
                    src={generatedPreview}
                    alt="AI generated ad preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleGenerate}
                    className="flex-1 gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Regenerate
                  </Button>
                  <Button onClick={handleContinue} className="flex-1 gap-1">
                    Continue <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="w-full aspect-video rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                <div className="text-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Your generated ad will appear here
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
