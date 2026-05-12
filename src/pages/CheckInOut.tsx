import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import CheckInCheckOutCard from "@/components/common/CheckInCheckOutCard";
import WorkCalendar from "@/components/common/WorkCalendar";

export default function CheckInOut() {
  const navigate = useNavigate();

  return (
    <AppLayout
      title="Check-in / Check-out"
      headerRight={
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-xl gap-1.5"
          onClick={() => navigate("/settings")}
        >
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </Button>
      }
    >
      <div className="h-full overflow-y-auto no-scrollbar p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-4 space-y-4">
        <CheckInCheckOutCard />
        <WorkCalendar />
      </div>
    </AppLayout>
  );
}
