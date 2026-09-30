import { Link } from 'react-router-dom';
import { Container } from '../components/Layout';

export default function NotFound() {
  return (
    <Container className="flex flex-col items-start gap-6 py-20">
      <p className="t-display text-[clamp(120px,30vw,340px)] text-ember" aria-hidden="true">
        404
      </p>
      <h1 className="t-heading t-lg">Такой страницы нет</h1>
      <p className="t-sub max-w-[40ch] text-muted">Возможно, ссылка устарела. Начните с главной или найдите преподавателя.</p>
      <div className="flex gap-6">
        <Link to="/" className="link text-[17px]">
          На главную
        </Link>
        <Link to="/teachers" className="link text-[17px]">
          Преподаватели
        </Link>
      </div>
    </Container>
  );
}
