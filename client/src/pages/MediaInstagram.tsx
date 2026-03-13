import MediaContentGenerator from "@/components/MediaContentGenerator";
import { Camera } from "lucide-react";

export default function MediaInstagram() {
  return (
    <MediaContentGenerator
      config={{
        platform: "instagram",
        name: "Instagram",
        icon: <Camera className="h-6 w-6 text-purple-600" />,
        color: "purple",
        topicPlaceholder: "e.g., Showcasing our latest tech office design with minimalist aesthetics and natural lighting",
        notesPlaceholder: "e.g., Focus on sustainability, highlight material choices, mention awards",
        description: "AI generates Instagram-style content with engaging English captions, relevant hashtags, and a cover image for your architectural projects",
      }}
    />
  );
}
