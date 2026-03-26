import { useParams } from 'react-router';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div>
      <h1>Project Detail</h1>
      <p>Project {id} details coming in Plan 04</p>
    </div>
  );
}
