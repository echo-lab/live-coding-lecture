export function makeID() {
  return crypto.randomUUID();
}

export function getEmail() {
  console.log("hi");
  let email = localStorage.getItem("user_email");
  if (email && email !== 'null') return email;
  console.log("there");
  email = prompt("Please enter your email");
  localStorage.setItem("user_email", email);
  return email;
}

export function clearEmail() {
  localStorage.removeItem("user_email");
}

export function getIdentity() {
    let uid = localStorage.getItem("user_id");
    if (uid) return uid;
    uid = makeID();
    localStorage.setItem("user_id", uid);
    return uid;
}


export const EXAMPLE_CODE = `# Here is some example code

# Slow version
def fibonacci(i):
  if i == 0 or i == 1:
    return 1
  
  return fibonacci(i-1) + fibonacci(i-2)
    

# Faster version
def fibonacci(n):
  fibs = []
  for i in range(n):
    if i <= 1:
      fibs.append(1)
      continue
    fibs.append(fibs[i-1]+fibs[i-2])
  return fibs[-1]
`
