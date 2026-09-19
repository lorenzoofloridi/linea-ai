"""Cinque lingue per i messaggi deterministici; lingua del dialogo rilevata dal modello."""
SUPPORTED=('it','en','fr','de','es')
PHRASES={
'Grazie! La tua richiesta è stata registrata per ':['Thank you! Your request has been registered for ','Merci ! Votre demande a été enregistrée pour ','Danke! Ihre Anfrage wurde gespeichert für ','¡Gracias! Tu solicitud ha sido registrada para '],
'. Posso aiutarti con altro?':['. Can I help you with anything else?','. Puis-je vous aider avec autre chose ?','. Kann ich Ihnen noch weiterhelfen?','. ¿Puedo ayudarte con algo más?'],
'Va bene, grazie! La tua richiesta è registrata. Buona giornata!':['Thank you! Your request is registered. Have a good day!','Merci ! Votre demande est enregistrée. Bonne journée !','Danke! Ihre Anfrage ist gespeichert. Einen schönen Tag!','¡Gracias! Tu solicitud está registrada. ¡Que tengas un buen día!'],
'La tua richiesta contiene:':['Your request contains:','Votre demande contient :','Ihre Anfrage enthält:','Tu solicitud contiene:'],
'Consenso al contatto: sì.':['Consent to contact: yes.','Accord pour être contacté : oui.','Einwilligung zur Kontaktaufnahme: ja.','Consentimiento de contacto: sí.'],
'Ti riepilogo la richiesta:':['Here is a summary of your request:','Voici le récapitulatif de votre demande :','Hier ist Ihre Anfrage zusammengefasst:','Este es el resumen de tu solicitud:'],
'Sei d’accordo a essere contattato da ':['Do you agree to be contacted by ','Acceptez-vous d’être contacté par ','Sind Sie damit einverstanden, kontaktiert zu werden von ','¿Aceptas que te contacte '],
' al numero indicato?':[' using the details provided?',' aux coordonnées indiquées ?',' über die angegebenen Kontaktdaten?',' usando los datos indicados?'],
'Vuoi aggiungere qualche altra informazione o richiesta da comunicare all’azienda?':['Would you like to add any information or request for the company?','Souhaitez-vous ajouter une information ou une demande pour l’entreprise ?','Möchten Sie weitere Informationen oder Wünsche für das Unternehmen ergänzen?','¿Quieres añadir información o alguna petición para la empresa?'],
'Ho aggiunto l’informazione alla tua richiesta. Posso aiutarti con altro?':['I added the information to your request. Can I help you with anything else?','J’ai ajouté cette information à votre demande. Puis-je vous aider avec autre chose ?','Ich habe die Information ergänzt. Kann ich Ihnen noch weiterhelfen?','He añadido la información a tu solicitud. ¿Puedo ayudarte con algo más?'],
'Nessun problema, non registrerò la richiesta di contatto. Posso comunque rispondere alle tue domande.':['No problem, I will not register a contact request. I can still answer your questions.','Aucun problème, je n’enregistrerai pas de demande de contact. Je peux répondre à vos questions.','Kein Problem, ich speichere keine Kontaktanfrage. Ich kann Ihre Fragen weiterhin beantworten.','No hay problema, no registraré una solicitud de contacto. Puedo responder a tus preguntas.'],
'Il numero di telefono inserito non sembra essere valido. Puoi controllarlo e inserirlo nuovamente?':['That phone number does not appear valid. Could you check it?','Ce numéro ne semble pas valide. Pouvez-vous le vérifier ?','Diese Telefonnummer scheint ungültig. Können Sie sie prüfen?','El teléfono no parece válido. ¿Puedes comprobarlo?'],
'Puoi indicarmi ':['Could you provide ','Pouvez-vous indiquer ','Können Sie mir Folgendes mitteilen: ','¿Puedes indicarme '],
'Per questo dettaglio posso riportare la tua richiesta al referente dell’azienda.':['I can pass this question to the company representative.','Je peux transmettre cette question au représentant de l’entreprise.','Ich kann diese Frage an das Unternehmen weitergeben.','Puedo transmitir esta pregunta al representante de la empresa.'],
'La conversazione è in attesa del personale dell’azienda.':['The conversation is awaiting the company team.','La conversation attend l’équipe de l’entreprise.','Die Unterhaltung wartet auf das Team des Unternehmens.','La conversación está a la espera del equipo de la empresa.'],
'Questa conversazione è conclusa.':['This conversation has ended.','Cette conversation est terminée.','Diese Unterhaltung ist beendet.','Esta conversación ha terminado.'],
'Al momento non riesco a elaborare la risposta. Puoi riprovare tra poco?':['I cannot process a response right now. Could you try again shortly?','Je ne peux pas répondre pour le moment. Pouvez-vous réessayer plus tard ?','Ich kann gerade keine Antwort erstellen. Versuchen Sie es bitte später erneut.','No puedo responder ahora. ¿Puedes intentarlo más tarde?']}
PHRASES.update({
'personale dell’azienda':['the company team','l’équipe de l’entreprise','das Team des Unternehmens','el equipo de la empresa'],
'prodotto, servizio o esigenza':['the product, service or need','le produit, le service ou le besoin','das Produkt, die Dienstleistung oder das Anliegen','el producto, servicio o necesidad'],
'nome e cognome':['your full name','vos nom et prénom','Ihren vollständigen Namen','tu nombre completo'],
'preferenza per essere contattati':['your preferred contact time','votre préférence pour être contacté','Ihre bevorzugte Kontaktzeit','tu preferencia de contacto'],
'Telefono':['Phone','Téléphone','Telefon','Teléfono'],
'Informazioni aggiuntive':['Additional information','Informations complémentaires','Weitere Informationen','Información adicional'],
'Nome e cognome':['Full name','Nom complet','Vollständiger Name','Nombre completo'],
'Prodotto, servizio o esigenza':['Product, service or need','Produit, service ou besoin','Produkt, Dienstleistung oder Anliegen','Producto, servicio o necesidad'],
'Preferenza per essere contattati':['Preferred contact time','Préférence de contact','Bevorzugte Kontaktzeit','Preferencia de contacto']})
def render(text,lang):
 if lang not in SUPPORTED[1:]:return text
 index=SUPPORTED[1:].index(lang)
 for key in sorted(PHRASES,key=len,reverse=True):text=text.replace(key,PHRASES[key][index])
 return text
