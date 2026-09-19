import ollama
for text in ['ciao','vorrei togliere il dente del giudizio','quando torno dalle ferie','Ho paura del dentista']:
 r=ollama.chat(model='qwen2.5:7b',format='json',messages=[{'role':'system','content':'''Estrai i dati dal messaggio. Restituisci JSON con nome, telefono, trattamento, tempistica. Ogni valore è una citazione esatta dal messaggio. Se manca usa stringa vuota.
Esempio: ciao -> {"nome":"","telefono":"","trattamento":"","tempistica":""}
Esempio: Ho paura del dentista -> {"nome":"","telefono":"","trattamento":"","tempistica":""}
Esempio: quando torno dalle ferie -> {"nome":"","telefono":"","trattamento":"","tempistica":"quando torno dalle ferie"}
Esempio: togliere il dente del giudizio -> {"nome":"","telefono":"","trattamento":"togliere il dente del giudizio","tempistica":""}'''},{'role':'user','content':text}],options={'temperature':0,'num_predict':200})
 print(text,'->',r.message.content,flush=True)
