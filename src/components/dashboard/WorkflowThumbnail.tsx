import Image from "next/image";
import workflowImage from "@/assets/expensivecar.jpg";

export function WorkflowThumbnail({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-md ${className}`}
    >
      <Image
        src={workflowImage}
        alt="Workflow thumbnail"
        fill
        className="object-cover"
      />
    </div>
  );
}