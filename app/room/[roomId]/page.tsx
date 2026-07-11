import { VideoRoom } from "@/components/VideoRoom";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;

  return <VideoRoom roomId={decodeURIComponent(roomId)} />;
}
