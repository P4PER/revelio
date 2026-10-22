// Which `actionErrors` hint follows a failed action's `error`. Only an ended
// session ('auth') has a fix the user can make from where they are; anything
// else ('invalid', 'forbidden') means the page is out of date with the
// server, which a reload shows.
export function actionErrorHint(error: string): 'signInHint' | 'reloadHint' {
  return error === 'auth' ? 'signInHint' : 'reloadHint'
}
