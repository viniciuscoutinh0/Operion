import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
    
    // Na rota inicial "/", ele renderiza o componente Login.
    expect(screen.getByText('Acesso Restrito')).toBeInTheDocument();
  });
});
