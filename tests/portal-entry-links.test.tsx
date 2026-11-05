import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { PublicLayout } from '../src/components/PublicLayout'

/**
 * Each portal keeps its own Supabase auth session, and the client is chosen from
 * the page that was loaded. Portal entry links therefore have to be real page
 * loads: a client-side navigation would keep the public site's staff client and
 * write the customer sign-in into the wrong session.
 */
function PathProbe() {
  const location = useLocation()
  return <p data-testid="path">{location.pathname}</p>
}

function renderPublicSite() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<PathProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('portal entry links', () => {
  it('sends the customer portal link as a full page load', async () => {
    const user = userEvent.setup()
    renderPublicSite()

    const link = screen.getAllByRole('link', { name: /Customer Portal/i })[0]
    expect(link).toHaveAttribute('href', '/portal/login')

    await user.click(link)
    expect(screen.getByTestId('path')).toHaveTextContent('/')
  })

  it('sends the employee portal link as a full page load', async () => {
    const user = userEvent.setup()
    renderPublicSite()

    const link = screen.getAllByRole('link', { name: /Employee Portal/i })[0]
    expect(link).toHaveAttribute('href', '/staff/login')

    await user.click(link)
    expect(screen.getByTestId('path')).toHaveTextContent('/')
  })
})
