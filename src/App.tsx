import './styles/tokens.css';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';

/**
 * Demo screen built the Straps way: every element is an INSTANCE of a registry
 * component, every value is a token. This file passes `straps audit` clean —
 * compare it to what an unguided AI would emit (raw #hex, redefined Button, etc.).
 */
export default function App() {
  return (
    <Card elevated padding="lg">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Account settings</strong>
        <Badge variant="success">Active</Badge>
      </header>

      <Input label="Display name" placeholder="Yilan Dong" />
      <Input label="Email" placeholder="you@example.com" error="Email already in use" />

      <footer style={{ display: 'flex', gap: 'var(--space-12)' }}>
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary">Save changes</Button>
      </footer>
    </Card>
  );
}
