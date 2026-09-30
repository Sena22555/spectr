import { PageHeader } from '../../components/ui';
import { RescheduleList } from '../teach/Requests';

export default function AdminRequests() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Переносы" lead="Все заявки школы. Обычно их решает преподаватель, но администратор может ответить за него." />
      <RescheduleList endpoint="/admin/reschedules" queryKey={['admin', 'reschedules']} />
    </div>
  );
}
