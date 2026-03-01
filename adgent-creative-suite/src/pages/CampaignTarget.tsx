import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Globe, Users, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const websites = ["Reddit", "TechCrunch", "Hacker News", "Stack Overflow"];

const ageGroups = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const interests = [
  "Technology",
  "Fashion",
  "Sports",
  "Gaming",
  "Finance",
  "Travel",
  "Food",
  "Health & Fitness",
  "Education",
  "Entertainment",
];
const genders = ["All", "Male", "Female", "Non-binary"];
const devices = ["All Devices", "Desktop", "Mobile", "Tablet"];

export default function CampaignTarget() {
  const navigate = useNavigate();
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [selectedAges, setSelectedAges] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [productUrl, setProductUrl] = useState("");
  const [productName, setProductName] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);

  // Image passed from CampaignCreate via sessionStorage
  const thumbnail = sessionStorage.getItem("adgent_thumbnail") || "";

  const toggleItem = (
    list: string[],
    setList: (v: string[]) => void,
    item: string,
  ) => {
    setList(
      list.includes(item) ? list.filter((i) => i !== item) : [...list, item],
    );
  };

  const handleLaunch = async () => {
    if (!productName.trim()) {
      toast.error("Product Name is required", {
        description: "Please enter a product name before launching.",
      });
      return;
    }
    if (!productUrl.trim()) {
      toast.error("Product URL is required", {
        description: "Please enter a valid product URL before launching.",
      });
      return;
    }

    setIsLaunching(true);
    try {
      let hostname = productUrl;
      try {
        hostname = new URL(productUrl).hostname.replace(/^www\./, "");
      } catch {
        /* keep raw value */
      }

      const slug = (productName.trim())
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const product = {
        id: slug || "campaign-product",
        name: productName.trim(),
        price: "",
        discount: "N/A",
        delivery: "",
        availability: "",
        category: "custom",
        theme: "dark",
        badge: displayText || null,
        thumbnailUrl: thumbnail.startsWith("http") ? thumbnail : "",
        productUrl: productUrl.trim(),
        suggestions: [
          {
            label: "Learn more",
            prompt: `Tell me more about ${productName.trim()}.`,
          },
          {
            label: "Check price",
            prompt: `What is the price of ${productName.trim()}?`,
          },
          {
            label: "View details",
            prompt: `Show me details for ${productName.trim()}.`,
          },
          {
            label: "Compare options",
            prompt: `What are alternatives to ${productName.trim()}?`,
          },
        ],
      };

      const body: Record<string, unknown> = { product };
      // For base64/data-URL images the backend saves them as a file in
      // the extension directory; for https URLs they're used directly.
      if (thumbnail && thumbnail.startsWith("data:")) {
        body.thumbnailDataUrl = thumbnail;
      }

      const res = await fetch("http://localhost:8787/api/campaign/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { detail?: string }).detail || `Server error ${res.status}`,
        );
      }

      toast.success("Campaign launched!", {
        description:
          "products.json updated — reload the extension to see your ad.",
      });
      sessionStorage.removeItem("adgent_thumbnail");
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Failed to launch campaign", { description: msg });
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif text-foreground">
          Campaign Targeting
        </h1>
        <p className="text-muted-foreground mt-1">
          Choose where and who sees your ads.
        </p>
      </div>

      {/* Product */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link className="w-4 h-4 text-primary" /> Product
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="productName">
              Product Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="productName"
              placeholder="e.g. NVIDIA GeForce RTX 5090"
              className="mt-1.5"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="productUrl">
              Product URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="productUrl"
              type="url"
              placeholder="https://example.com/product"
              className="mt-1.5"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="displayText">
              Display Text{" "}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="displayText"
              placeholder="e.g. Shop the RTX 5090"
              className="mt-1.5"
              value={displayText}
              onChange={(e) => setDisplayText(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Placement */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="w-4 h-4 text-primary" /> Ad Placement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>Select websites to display your ads</Label>
          <div className="flex flex-wrap gap-2">
            {websites.map((site) => (
              <button
                key={site}
                onClick={() =>
                  toggleItem(selectedSites, setSelectedSites, site)
                }
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedSites.includes(site)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:border-primary/50"
                }`}
              >
                {site}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Audience */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-primary" /> Target Audience
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Gender</Label>
              <Select defaultValue="All">
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {genders.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Device</Label>
              <Select defaultValue="All Devices">
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Age Groups</Label>
            <div className="flex flex-wrap gap-2">
              {ageGroups.map((age) => (
                <button
                  key={age}
                  onClick={() => toggleItem(selectedAges, setSelectedAges, age)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedAges.includes(age)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {age}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Interests</Label>
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => (
                <button
                  key={interest}
                  onClick={() =>
                    toggleItem(
                      selectedInterests,
                      setSelectedInterests,
                      interest,
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedInterests.includes(interest)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="e.g. United States, Europe"
              className="mt-1.5"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center pt-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
        <Button onClick={handleLaunch} className="gap-1" disabled={isLaunching}>
          {isLaunching ? (
            "Launching…"
          ) : (
            <>
              <span>Launch Campaign</span> <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
