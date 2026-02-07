## Каждый запрос принимает параметры                     "gi_map_core_cr": user.token,

## Для получения информации о пешеходном траифике вокруг дома нужно
## 1 Получить центр кординат здания
## 2 От центра каждого здания нарисовать bounding box с точными границами дома, в расстоянии 1м 
## 3 Сравнить входит ли bounding box в bounding box дороги
## 4 Поройтись по каждой точке дороги пока bounding box совпадает с шагом в 1м 

##     const response = await geo.get_data_pool({
        action: "user/getusermodules",
        token: "bXJncml2ZXJzQHlhbmRleC5ydXxhMzg4ZGJhNi0zNDA5LTRmYmUtYmFmNy0yMjNlN2JmMmQ5MmI=",
    })
    const modules = await get(response.results)
    console.log(modules)

## 6450