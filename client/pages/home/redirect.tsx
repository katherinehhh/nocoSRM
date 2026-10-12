import { Navigate } from 'react-router';
// The workspace has contextual children; an explicit path avoids competing with pure root navigation groups.
export default function HomeRedirect() {
  return <Navigate to='/workspace' replace />;
}
