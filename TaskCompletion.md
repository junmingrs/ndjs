
1) Upon task completion (involving email):
- AI will read what user has written
- AI will convert into professional message in regards to user's relationsship with the recipient
- Return in json
- format:
``` ts
interface EmailResponse {
  subject: string;
  body: string;
} 
```
