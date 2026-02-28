import { useNavigate } from "react-router-dom";
import { ImagePlus, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="relative max-w-3xl mx-auto space-y-8 pt-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Create a New Ad</h1>
        <p className="mt-2 text-muted-foreground">Upload an existing creative or generate one with AI.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card
          className="group cursor-pointer border-border hover:border-primary/50 transition-all hover:shadow-glow-sm animate-fade-up"
          style={{ animationDelay: "0.1s" }}
          onClick={() => navigate("/campaign/new?mode=upload")}
        >
          <CardContent className="flex flex-col items-center text-center p-8 gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-secondary/30 group-hover:bg-primary/10 transition-colors">
              <ImagePlus className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Upload Your Ad</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Already have a creative ready? Upload your image and start a campaign.
              </p>
            </div>
            <Button variant="outline" size="sm" className="mt-2 gap-1">
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </CardContent>
        </Card>

        <Card
          className="group cursor-pointer border-primary/30 bg-primary/5 hover:border-primary hover:shadow-glow transition-all animate-fade-up"
          style={{ animationDelay: "0.25s" }}
          onClick={() => navigate("/campaign/new?mode=generate")}
        >
          <CardContent className="flex flex-col items-center text-center p-8 gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Generate with AI</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Describe your ad and let our AI agent create it for you.
              </p>
            </div>
            <Button size="sm" className="mt-2 gap-1">
              Create with AI <Sparkles className="w-3.5 h-3.5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
